// Projeto Solimões - nó embarcado (versão Wi-Fi direto para o site)
//
// Lê a cada 1 s:  tensão/corrente da bateria (INA226 + shunt), tensão/corrente do
// painel (2º INA226), temperatura da bateria (DS18B20), temp/umidade da caixa (SHT31)
// e o ponto médio do banco (divisor + ADC).
// A cada SEND_PERIOD_MS envia um resumo (média/mín/máx, Ah, SoC, flags) em JSON por
// HTTP POST para o servidor. Corte de carga e alerta local funcionam sem internet.

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <INA226.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_SHT31.h>
#include "config.h"

// ---------------- Sensores ----------------
INA226 inaBat(INA_BAT_ADDR);
INA226 inaPan(INA_PAN_ADDR);
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds18(&oneWire);
Adafruit_SHT31 sht31;

bool okInaBat = false, okInaPan = false, okSht = false, okDs = false;

// ---------------- Estatística de uma grandeza no intervalo ----------------
struct Stat {
  float sum = 0, mn = NAN, mx = NAN;
  uint32_t n = 0;
  void add(float v) {
    if (isnan(v)) return;
    sum += v; n++;
    if (isnan(mn) || v < mn) mn = v;
    if (isnan(mx) || v > mx) mx = v;
  }
  void reset() { sum = 0; mn = mx = NAN; n = 0; }
  void toJson(JsonObject o) const {
    if (n == 0) { o["avg"] = nullptr; o["min"] = nullptr; o["max"] = nullptr; return; }
    o["avg"] = round3(sum / n); o["min"] = round3(mn); o["max"] = round3(mx);
  }
  static float round3(float v) { return roundf(v * 1000.0f) / 1000.0f; }
};

Stat sBatV, sBatI, sPanV, sPanI, sLoadI, sBatT, sBoxT, sBoxRH, sMidV;

// ---------------- Estado ----------------
float soc = NAN;              // %
float ahIn = 0, ahOut = 0;    // Ah acumulados desde o último envio
float ahInTotal = 0, ahOutTotal = 0;
uint32_t restSinceMs = 0;     // início do período em repouso (|I| pequeno)
bool loadCut = false;
uint32_t seq = 0;
uint32_t lastSample = 0, lastSend = 0;
uint16_t flagsInterval = 0;   // flags que ocorreram em algum momento do intervalo

enum Flag : uint16_t {
  F_LOW_SOC     = 1 << 0,
  F_LOAD_CUT    = 1 << 1,
  F_BAT_HOT     = 1 << 2,
  F_BOX_HUMID   = 1 << 3,
  F_IMBALANCE   = 1 << 4,
  F_SENSOR_FAIL = 1 << 5,
  F_FULL_CHARGE = 1 << 6,
};

// ---------------- SoC por tensão de circuito aberto (chumbo-ácido, ~25 °C) ----------------
// 12,7 V = 100% · 12,4 V = 75% · 12,2 V = 50% · 12,0 V = 25% · 11,8 V = 0%
float socFromOcv(float vBat) {
  float v = vBat / BAT_CELLS_12V;
  const float V[] = {11.8f, 12.0f, 12.2f, 12.4f, 12.7f};
  const float S[] = {0, 25, 50, 75, 100};
  if (v <= V[0]) return 0;
  if (v >= V[4]) return 100;
  for (int i = 0; i < 4; i++)
    if (v < V[i + 1]) return S[i] + (S[i + 1] - S[i]) * (v - V[i]) / (V[i + 1] - V[i]);
  return 100;
}

// ---------------- Modo 2: potenciômetro + botão ----------------
// O pot ajusta só a grandeza selecionada; as outras ficam congeladas no último valor.
// Cada aperto do botão passa para a próxima da lista.
#if SENSOR_MODE == 2
struct PotVar { const char* key; const char* desc; const char* unit; float lo, hi, value; };
PotVar potVars[] = {
  //  chave     descrição                               un    mín    máx   inicial
  // bat_v aqui é a tensão EM REPOUSO; a medida é  repouso + bat_i * Rint  (física da bateria)
  {"bat_v",  "tensao da bateria em repouso",           "V",  10.5f, 14.5f, 12.6f},
  {"bat_i",  "corrente da bateria (+ carga/- desc.)",  "A",  -5.0f,  5.0f,  0.5f},
  {"pan_v",  "tensao do painel",                       "V",   0.0f, 22.0f, 17.5f},
  {"pan_i",  "corrente do painel",                     "A",   0.0f,  3.0f,  1.0f},
  {"bat_t",  "temperatura da bateria",                 "C",  15.0f, 60.0f, 30.0f},
  {"box_t",  "temperatura da caixa",                   "C",  15.0f, 60.0f, 32.0f},
  {"box_rh", "umidade da caixa",                       "%",  30.0f, 100.0f, 65.0f},
  // ponto médio = bat_v/2 + desvio (assim mexer em bat_v não gera falso desequilíbrio)
  {"mid_v",  "desvio do ponto medio (0 = equilibrado)", "V",  -0.6f,  0.6f,  0.0f},
  {"rint",   "resistencia interna simulada",           "mOhm", 10.0f, 150.0f, 30.0f},
  {"soc",    "estado de carga (forca o SoC)",          "%",   0.0f, 100.0f, 90.0f},
};
const int N_POT_VARS = sizeof(potVars) / sizeof(potVars[0]);
const int IDX_RINT = N_POT_VARS - 2;
const int IDX_SOC = N_POT_VARS - 1;
int potIdx = 0;
bool socForced = false;      // true quando o pot está mexendo direto no SoC

void announcePotVar() {
  PotVar& v = potVars[potIdx];
  Serial.printf("\n[pot] %d/%d  ajustando %s (%s), faixa %.1f a %.1f %s\n",
                potIdx + 1, N_POT_VARS, v.key, v.desc, v.lo, v.hi, v.unit);
}

// Botão com debounce: troca a grandeza a cada aperto (borda de descida)
void pollButton() {
  static bool lastStable = HIGH, lastRaw = HIGH;
  static uint32_t tChange = 0;
  bool raw = digitalRead(PIN_BUTTON);
  if (raw != lastRaw) { lastRaw = raw; tChange = millis(); }
  static uint32_t lastPress = 0;
  if (millis() - tChange > 50 && raw != lastStable) {
    lastStable = raw;
    // ignora "apertos" a menos de 300 ms do anterior (trepidação do botão)
    if (raw == LOW && millis() - lastPress > 300) {
      lastPress = millis();
      potIdx = (potIdx + 1) % N_POT_VARS;
      announcePotVar();
    }
  }
}

// Lê o pot (0..~3,1 V) e converte para a faixa da grandeza selecionada
void updatePotVar() {
  uint32_t mv = 0;
  for (int i = 0; i < 64; i++) mv += analogReadMilliVolts(PIN_POT);
  // O ADC do ESP32 não lê abaixo de ~0,14 V e satura perto de 3,1 V: usa só essa janela,
  // para o pot alcançar o mínimo e o máximo da faixa.
  const float MV_MIN = 150.0f, MV_MAX = 3100.0f;
  float x = constrain((mv / 64.0f - MV_MIN) / (MV_MAX - MV_MIN), 0.0f, 1.0f);

  // Zona morta: com o Wi-Fi ligado o ADC oscila ~2% sozinho. A posição só muda quando o pot
  // anda mais que isso, e aí pula direto (sem média móvel, para os degraus da Rint ficarem nítidos).
  // Nas pontas a zona morta não vale, para alcançar o mínimo e o máximo exatos.
  // A mudança precisa aparecer em 2 leituras seguidas: o pico de ruído de quando o rádio
  // transmite dura uma leitura só e é ignorado.
  static float xApplied = -1;
  static int lastIdx = -1;
  static bool pending = false;
  bool edge = (x <= 0.0f || x >= 1.0f) && x != xApplied;
  bool moved = fabsf(x - xApplied) > 0.025f || edge;
  if (potIdx != lastIdx || xApplied < 0) { xApplied = x; pending = false; }
  else if (moved && pending) { xApplied = x; pending = false; }
  else pending = moved;
  lastIdx = potIdx;

  PotVar& v = potVars[potIdx];
  float newVal = v.lo + xApplied * (v.hi - v.lo);
  if (fabsf(newVal - v.value) > 0.001f * (v.hi - v.lo))
    Serial.printf("[pot] %s = %.2f %s\n", v.key, newVal, v.unit);
  v.value = newVal;
  socForced = (potIdx == IDX_SOC);
}
#endif

// ---------------- Leitura (real ou simulada) ----------------
struct Reading { float batV, batI, panV, panI, batT, boxT, boxRH, midV; };

Reading readSensors() {
  Reading r;
#if SENSOR_MODE == 2
  updatePotVar();
  r.batI  = potVars[1].value;
  // Tensão nos terminais = repouso + I * Rint (I > 0 carregando sobe a tensão, I < 0 derruba)
  r.batV  = potVars[0].value + r.batI * potVars[IDX_RINT].value / 1000.0f;
  r.panV  = potVars[2].value;
  r.panI  = potVars[3].value;
  r.batT  = potVars[4].value;
  r.boxT  = potVars[5].value;
  r.boxRH = potVars[6].value;
  r.midV  = r.batV / 2 + potVars[7].value;
#elif SENSOR_MODE == 1
  // Ciclo de "sol" de 2 minutos para ver os gráficos mexendo na demo
  float t = (millis() % 120000UL) / 120000.0f;
  float sun = max(0.0f, sinf(t * 2 * PI));
  r.panI = 1.2f * sun + random(-20, 20) / 1000.0f;
  r.panV = sun > 0.05f ? 17.5f + random(-30, 30) / 100.0f : 0.5f;
  float load = 0.4f + (random(0, 100) < 10 ? 0.6f : 0.0f);
  r.batI = r.panI - load;
  // repouso + I * Rint (35 mOhm), para o cálculo de Rint ter o que medir
  r.batV = 12.2f + 0.6f * sun + r.batI * 0.035f + random(-2, 2) / 1000.0f;
  r.batT = 29.0f + 3 * sun + random(-10, 10) / 10.0f;
  r.boxT = 31.0f + 4 * sun;
  r.boxRH = 70.0f - 10 * sun;
  r.midV = MID_HAS_BANK ? r.batV / 2 : NAN;
#else
  r.batV = okInaBat ? inaBat.getBusVoltage() : NAN;
  r.batI = okInaBat ? BAT_CURRENT_SIGN * inaBat.getCurrent() : NAN;   // + carregando
  r.panV = okInaPan ? inaPan.getBusVoltage() : NAN;
  r.panI = okInaPan ? inaPan.getCurrent() : NAN;

  // DS18B20: lê a conversão pedida no ciclo anterior e já pede a próxima
  if (okDs) {
    float t = ds18.getTempCByIndex(0);
    r.batT = (t == DEVICE_DISCONNECTED_C) ? NAN : t;
    ds18.requestTemperatures();
  } else r.batT = NAN;

  r.boxT = okSht ? sht31.readTemperature() : NAN;
  r.boxRH = okSht ? sht31.readHumidity() : NAN;

#if MID_HAS_BANK
  uint32_t mv = 0;
  for (int i = 0; i < 16; i++) mv += analogReadMilliVolts(PIN_MIDPOINT);
  r.midV = (mv / 16.0f / 1000.0f) * (MID_R_TOP + MID_R_BOT) / MID_R_BOT;
#else
  r.midV = NAN;
#endif
#endif
  return r;
}

// ---------------- Resistência interna (Rint ≈ ΔV/ΔI) ----------------
// Compara cada leitura com a anterior. Quando a corrente da bateria dá um degrau (uma carga
// ligou/desligou), a tensão nos terminais pula ΔV = Rint·ΔI. Com a convenção I > 0 = carregando,
// Rint = ΔV/ΔI sai positivo nos dois sentidos. Só o nó consegue ver esse degrau: no pacote
// vão médias de vários segundos, onde ele some.
float prevV = NAN, prevI = NAN;
const int RINT_MAX_EVENTS = 16;
float rintBuf[RINT_MAX_EVENTS];
int rintN = 0;

void detectRint(const Reading& r) {
  if (!isnan(prevV) && !isnan(prevI) && !isnan(r.batV) && !isnan(r.batI)) {
    float dI = r.batI - prevI, dV = r.batV - prevV;
    if (fabsf(dI) >= RINT_MIN_DI_A && fabsf(dV) >= RINT_MIN_DV_V) {
      float R = dV / dI;
      if (R >= RINT_MIN_OHM && R <= RINT_MAX_OHM) {
        if (rintN < RINT_MAX_EVENTS) rintBuf[rintN++] = R;
        Serial.printf("[rint] degrau dI=%+.2f A, dV=%+.3f V -> Rint = %.1f mOhm\n", dI, dV, R * 1000);
      }
    }
  }
  prevV = r.batV;
  prevI = r.batI;
}

// Mediana dos eventos do intervalo (ignora um evento ruim isolado melhor que a média)
float rintMedian() {
  if (rintN == 0) return NAN;
  float a[RINT_MAX_EVENTS];
  for (int i = 0; i < rintN; i++) a[i] = rintBuf[i];
  for (int i = 1; i < rintN; i++)          // ordenação por inserção (no máx. 16 itens)
    for (int j = i; j > 0 && a[j - 1] > a[j]; j--) { float t = a[j]; a[j] = a[j - 1]; a[j - 1] = t; }
  return rintN % 2 ? a[rintN / 2] : (a[rintN / 2 - 1] + a[rintN / 2]) / 2;
}

// ---------------- Lógica local (não depende de internet) ----------------
void localLogic(const Reading& r, float dtHours) {
  uint16_t f = 0;

  // Contagem de coulombs: SoC(t) = SoC0 + (1/Cnom) * integral(Ibat dt)
  if (!isnan(r.batI)) {
    float dAh = r.batI * dtHours;
    if (dAh > 0) { ahIn += dAh; ahInTotal += dAh; } else { ahOut -= dAh; ahOutTotal -= dAh; }
    if (!isnan(soc)) soc = constrain(soc + 100.0f * dAh / BAT_CAPACITY_AH, 0.0f, 100.0f);
  }
  if (isnan(soc) && !isnan(r.batV)) soc = socFromOcv(r.batV);   // valor inicial
#if SENSOR_MODE == 2
  if (socForced) soc = potVars[IDX_SOC].value;   // simulação: pot manda no SoC
#endif

  // Recalibração 1: carga completa (controlador em flutuação: tensão alta, corrente baixa)
  if (!isnan(r.batV) && !isnan(r.batI) &&
      r.batV / BAT_CELLS_12V > 13.3f && fabsf(r.batI) < 0.02f * BAT_CAPACITY_AH) {
    soc = 100; f |= F_FULL_CHARGE;
  }
  // Recalibração 2: horas em repouso -> tensão de circuito aberto
  if (!isnan(r.batI) && fabsf(r.batI) < 0.05f) {
    if (restSinceMs == 0) restSinceMs = millis();
    if (millis() - restSinceMs > 2UL * 3600UL * 1000UL) { soc = socFromOcv(r.batV); restSinceMs = millis(); }
  } else restSinceMs = 0;

  // Corte de cargas não essenciais com histerese
  if (!isnan(soc)) {
    if (!loadCut && soc < SOC_CUT_PCT) loadCut = true;
    if (loadCut && soc > SOC_RESTORE_PCT) loadCut = false;
    if (soc < SOC_CUT_PCT) f |= F_LOW_SOC;
  }
  digitalWrite(PIN_RELAY, loadCut ? LOW : HIGH);   // HIGH = cargas ligadas (ajuste ao seu relé)
  if (loadCut) f |= F_LOAD_CUT;

  if (!isnan(r.batT) && r.batT > BAT_TEMP_HIGH_C) f |= F_BAT_HOT;
  if (!isnan(r.boxRH) && r.boxRH > BOX_RH_HIGH_PCT) f |= F_BOX_HUMID;
  if (!isnan(r.midV) && !isnan(r.batV) && fabsf(r.midV - r.batV / 2) > MID_IMBALANCE_V) f |= F_IMBALANCE;
  if (isnan(r.batV) || isnan(r.batT) || isnan(r.boxT)) f |= F_SENSOR_FAIL;

  // Alerta local: acende o LED/buzzer se algo crítico
  bool alert = f & (F_LOW_SOC | F_BAT_HOT | F_LOAD_CUT);
  digitalWrite(PIN_ALERT_LED, alert ? HIGH : LOW);

  flagsInterval |= f;
}

// ---------------- Wi-Fi ----------------
// Não bloqueia: só dispara a conexão e volta. Chamada a todo loop, então o pot e o botão
// continuam respondendo mesmo com o Wi-Fi fora do ar.
void ensureWifi() {
#if !WIFI_ENABLED
  return;
#endif
  static bool wasConnected = false, started = false;
  static uint32_t lastTry = 0;
  if (WiFi.status() == WL_CONNECTED) {
    if (!wasConnected)
      Serial.printf("[wifi] ok, IP %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    wasConnected = true;
    return;
  }
  if (wasConnected) Serial.println("[wifi] caiu, reconectando...");
  wasConnected = false;
  if (!started || millis() - lastTry > 15000) {   // tenta de novo a cada 15 s
    if (started) Serial.println("[wifi] ainda sem conexao (rede 2,4 GHz? senha?), tentando de novo");
    else Serial.printf("[wifi] conectando em %s...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
#if WIFI_LOW_TX_POWER
    WiFi.setTxPower(WIFI_POWER_8_5dBm);
#endif
    started = true;
    lastTry = millis();
  }
}

// ---------------- Monta e envia o pacote ----------------
void addFlags(JsonArray a, uint16_t f) {
  if (f & F_LOW_SOC) a.add("low_soc");
  if (f & F_LOAD_CUT) a.add("load_cut");
  if (f & F_BAT_HOT) a.add("bat_hot");
  if (f & F_BOX_HUMID) a.add("box_humid");
  if (f & F_IMBALANCE) a.add("imbalance");
  if (f & F_SENSOR_FAIL) a.add("sensor_fail");
  if (f & F_FULL_CHARGE) a.add("full_charge");
}

void sendSummary() {
  JsonDocument doc;
  doc["node"] = NODE_ID;
  doc["seq"] = seq++;
  doc["uptime_s"] = millis() / 1000;
  doc["samples"] = sBatV.n;
  doc["simulated"] = (SENSOR_MODE != 0);
  sBatV.toJson(doc["bat_v"].to<JsonObject>());
  sBatI.toJson(doc["bat_i"].to<JsonObject>());
  sPanV.toJson(doc["pan_v"].to<JsonObject>());
  sPanI.toJson(doc["pan_i"].to<JsonObject>());
  sLoadI.toJson(doc["load_i"].to<JsonObject>());
  sBatT.toJson(doc["bat_t"].to<JsonObject>());
  sBoxT.toJson(doc["box_t"].to<JsonObject>());
  sBoxRH.toJson(doc["box_rh"].to<JsonObject>());
  sMidV.toJson(doc["mid_v"].to<JsonObject>());
  doc["ah_in"] = Stat::round3(ahIn);
  doc["ah_out"] = Stat::round3(ahOut);
  doc["ah_in_total"] = Stat::round3(ahInTotal);
  doc["ah_out_total"] = Stat::round3(ahOutTotal);
  if (isnan(soc)) doc["soc"] = nullptr; else doc["soc"] = roundf(soc * 10) / 10;
  doc["load_cut"] = loadCut;
  float rint = rintMedian();
  if (isnan(rint)) doc["rint_mohm"] = nullptr; else doc["rint_mohm"] = roundf(rint * 10000) / 10;
  doc["rint_n"] = rintN;   // quantos degraus de corrente houve no intervalo
  addFlags(doc["flags"].to<JsonArray>(), flagsInterval);
  doc["rssi"] = WiFi.RSSI();

  String body;
  serializeJson(doc, body);
  Serial.println(body);

  if (!WIFI_ENABLED) Serial.println("[http] Wi-Fi desligado no config.h, pacote nao enviado");
  else if (WiFi.status() != WL_CONNECTED) Serial.println("[http] sem Wi-Fi, pacote nao enviado");
  if (WiFi.status() == WL_CONNECTED) {
    // https:// -> conexão TLS; http:// -> conexão simples (servidor na rede local)
    WiFiClientSecure tls;
    WiFiClient plain;
    bool https = strncmp(SERVER_URL, "https://", 8) == 0;
    // setInsecure(): criptografa mas não confere o certificado do site. Suficiente para a
    // demo; em produção use tls.setCACert(<certificado raiz do provedor>).
    if (https) tls.setInsecure();

    HTTPClient http;
    http.begin(https ? (WiFiClient&)tls : plain, SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Api-Token", API_TOKEN);
    http.setConnectTimeout(4000);   // servidor desligado: desiste rápido
    http.setTimeout(15000);         // hospedagens grátis "dormem" e demoram para acordar
    int code = http.POST(body);
    Serial.printf("[http] POST -> %d %s\n", code,
                  code > 0 ? http.getString().c_str() : http.errorToString(code).c_str());
    http.end();
  }

  // Zera o intervalo (mesmo se falhou: a próxima versão pode guardar em fila/SD)
  sBatV.reset(); sBatI.reset(); sPanV.reset(); sPanI.reset(); sLoadI.reset();
  sBatT.reset(); sBoxT.reset(); sBoxRH.reset(); sMidV.reset();
  ahIn = ahOut = 0;
  rintN = 0;
  flagsInterval = 0;
}

// ---------------- Setup / loop ----------------
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n== Projeto Solimoes - no " NODE_ID " ==");

  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, HIGH);
  pinMode(PIN_ALERT_LED, OUTPUT);

#if SENSOR_MODE == 0
  Wire.begin(PIN_SDA, PIN_SCL);

  okInaBat = inaBat.begin();
  if (okInaBat) {
    inaBat.setMaxCurrentShunt(BAT_MAX_CURRENT_A, BAT_SHUNT_OHM);
    inaBat.setAverage(INA226_16_SAMPLES);
  }
  okInaPan = inaPan.begin();
  if (okInaPan) {
    inaPan.setMaxCurrentShunt(PAN_MAX_CURRENT_A, PAN_SHUNT_OHM);
    inaPan.setAverage(INA226_16_SAMPLES);
  }
  okSht = sht31.begin(SHT31_ADDR);

  ds18.begin();
  okDs = ds18.getDeviceCount() > 0;
  ds18.setWaitForConversion(false);
  if (okDs) ds18.requestTemperatures();

  analogSetPinAttenuation(PIN_MIDPOINT, ADC_11db);

  Serial.printf("INA226 bateria: %s | INA226 painel: %s | SHT31: %s | DS18B20: %s\n",
                okInaBat ? "ok" : "FALHOU", okInaPan ? "ok" : "FALHOU",
                okSht ? "ok" : "FALHOU", okDs ? "ok" : "FALHOU");
#elif SENSOR_MODE == 1
  Serial.println("MODO SIMULADO: sem sensores, dados falsos");
#else
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  analogSetPinAttenuation(PIN_POT, ADC_11db);
  Serial.println("MODO POTENCIOMETRO: gire o pot; aperte o botao para trocar a grandeza");
  announcePotVar();
#endif

  ensureWifi();
  lastSample = lastSend = millis();
}

void loop() {
  uint32_t now = millis();

  ensureWifi();   // não bloqueia

#if SENSOR_MODE == 2
  pollButton();   // checado a todo loop para não perder apertos
#endif

  if (now - lastSample >= SAMPLE_PERIOD_MS) {
    float dtHours = (now - lastSample) / 3600000.0f;
    lastSample = now;

    Reading r = readSensors();
    sBatV.add(r.batV);  sBatI.add(r.batI);
    sPanV.add(r.panV);  sPanI.add(r.panI);
    if (!isnan(r.panI) && !isnan(r.batI)) sLoadI.add(r.panI - r.batI);   // I_carga = I_painel - I_bateria
    detectRint(r);
    sBatT.add(r.batT);  sBoxT.add(r.boxT);  sBoxRH.add(r.boxRH);  sMidV.add(r.midV);

    localLogic(r, dtHours);
  }

  if (now - lastSend >= SEND_PERIOD_MS) {
    lastSend = now;
    sendSummary();
  }
}
