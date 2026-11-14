#pragma once
// ======================= EDITE AQUI =======================

// --- Wi-Fi ---
#define WIFI_SSID "Iago\xE2\x80\x99s iPhone" // o iPhone usa o apostrofo tipografico (’), nao o '
#define WIFI_PASSWORD "12345678"
#define WIFI_ENABLED 1      // 0 = não liga o Wi-Fi (para testar pot e botão sem rede)
#define WIFI_LOW_TX_POWER 1 // 1 = rádio com menos potência: menos pico de corrente,
                            // evita a placa travar/reiniciar em USB fraco (alcance menor)

// --- Servidor ---
// Site hospedado na internet:  "https://seu-app.onrender.com/api/telemetry"  (https funciona)
// Notebook na mesma rede:      "http://192.168.0.10:8000/api/telemetry"  (ipconfig -> IPv4)
// O caminho /api/telemetry é obrigatório: sem ele o POST cai na página inicial e nada é gravado
#define SERVER_URL "https://solimoes.vercel.app/api/telemetry"
// Teste local (npm run dev na pasta vercel/):  "http://<IP do PC>:3000/api/telemetry"
#define API_TOKEN "b07a8382eac2113b97a235252bccdcb513589ce7fcabeddd" // tem que ser igual ao do servidor

// --- Identificação do nó ---
#define NODE_ID "casa-01"

// --- Origem das medições ---
// 0 = sensores reais (INA226, DS18B20, SHT31, divisor)
// 1 = dados falsos automáticos (ciclo de sol de 2 min)
// 2 = potenciômetro + botão: o pot ajusta UMA grandeza; cada aperto do botão troca qual
#define SENSOR_MODE 2

// --- Modo 2: potenciômetro e botão ---
// Pot: pontas em 3V3 e GND, cursor (meio) no GPIO35.  Botão: entre GPIO27 e GND.
#define PIN_POT 35    // ADC1 (só entrada). Não use pinos do ADC2: brigam com o Wi-Fi
#define PIN_BUTTON 27 // usa o pull-up interno, apertado = LOW

// --- Temporização ---
#define SAMPLE_PERIOD_MS 1000UL // lê os sensores a cada 1 s
#define SEND_PERIOD_MS 5000UL   // demo: 5 s. Produção: 5-15 min (300000-900000)

// --- Pinos ---
#define PIN_SDA 21
#define PIN_SCL 22
#define PIN_ONEWIRE 4   // DS18B20 (com resistor de 4,7k para 3,3V)
#define PIN_MIDPOINT 34 // ADC1 (só entrada) - divisor do ponto médio
#define PIN_RELAY 26    // relé das cargas não essenciais
#define PIN_ALERT_LED 2 // LED (ou buzzer via transistor)

// --- Endereços I2C ---
#define INA_BAT_ADDR 0x40 // INA226 da bateria (A0=GND, A1=GND)
#define INA_PAN_ADDR 0x41 // INA226 do painel  (A0=VCC, A1=GND)
#define SHT31_ADDR 0x44

// --- Shunts ---
// Shunt externo 20 A / 75 mV  ->  R = 0,075 / 20 = 0,00375 ohm
#define BAT_SHUNT_OHM 0.00375f
#define BAT_MAX_CURRENT_A 20.0f
// Painel: mesmo tipo de shunt (ajuste ao seu)
#define PAN_SHUNT_OHM 0.00375f
#define PAN_MAX_CURRENT_A 20.0f
// Inverta (-1) se a corrente de carga da bateria aparecer negativa
#define BAT_CURRENT_SIGN 1.0f

// --- Divisor do ponto médio: Vin -> R_TOP -> ADC -> R_BOT -> GND ---
#define MID_R_TOP 100000.0f
#define MID_R_BOT 22000.0f
#define MID_HAS_BANK 0 // 1 se houver 2 baterias em série (banco 24 V)

// --- Bateria ---
#define BAT_CAPACITY_AH 7.0f // demo: bateria de nobreak 12 V 7 Ah
#define BAT_CELLS_12V 1      // 2 se banco de 24 V

// --- Limites / alertas (seção 1 e 2 do documento) ---
#define SOC_CUT_PCT 50.0f     // corta cargas não essenciais abaixo disso
#define SOC_RESTORE_PCT 60.0f // religa acima disso (histerese)
#define BAT_TEMP_HIGH_C 45.0f
#define BOX_RH_HIGH_PCT 85.0f
#define MID_IMBALANCE_V 0.3f

// --- Resistência interna (seção 2: Rint ≈ ΔV/ΔI quando uma carga liga/desliga) ---
// Calculada no nó porque o degrau dura segundos e some nas médias do pacote.
#define RINT_MIN_DI_A 0.3f   // degrau mínimo de corrente entre 2 leituras para contar
#define RINT_MIN_DV_V 0.003f // abaixo disso o ΔV é ruído do sensor
#define RINT_MIN_OHM 0.002f  // faixa plausível (bateria 12 V chumbo-ácido: ~0,02-0,1 ohm)
#define RINT_MAX_OHM 1.0f
