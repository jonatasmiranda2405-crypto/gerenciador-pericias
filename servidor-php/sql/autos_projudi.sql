-- Autos baixados do PROJUDI pela extensão (um registro por arquivo).
-- A chave única (caso_id, projudi_id) é o que impede duplicados.
CREATE TABLE IF NOT EXISTS autos_projudi (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  caso_id       VARCHAR(64)  NOT NULL,              -- id da perícia no PeríciaFlow
  projudi_id    VARCHAR(128) NOT NULL,              -- Id_MovimentacaoArquivo do PROJUDI
  nome          VARCHAR(255) NOT NULL,
  fase          VARCHAR(255) NOT NULL DEFAULT '',   -- movimentação ("003 - Decisão - Nomeação de Perito")
  movimentacao  VARCHAR(16)  NOT NULL DEFAULT '',
  data_mov      DATE NULL,
  mime          VARCHAR(64)  NOT NULL,
  tamanho       INT UNSIGNED NOT NULL,
  sha256        CHAR(64)     NOT NULL,              -- do arquivo original (antes de criptografar)
  caminho       VARCHAR(255) NOT NULL,              -- arquivo criptografado, fora da pasta pública
  enviado_por   VARCHAR(255) NOT NULL DEFAULT '',
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_caso_projudi (caso_id, projudi_id),
  KEY ix_caso (caso_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
