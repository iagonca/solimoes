-- local_day, severity_rank e is_bulk não leem tabelas: sem SET search_path o Postgres
-- consegue embuti-las na consulta (com SET elas viram uma chamada por linha).
-- Só app_now(), que lê settings, precisa do search_path fixo.
alter function local_day(timestamptz) reset search_path;
alter function severity_rank(text) reset search_path;
alter function is_bulk(int) reset search_path;
