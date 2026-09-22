-- Dev-only MySQL for testing BI database sources (docker compose --profile bi up -d mysql).
CREATE TABLE vendas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  data DATE NOT NULL,
  vendedor VARCHAR(100) NOT NULL,
  valor DECIMAL(12, 2) NOT NULL
);

INSERT INTO vendas (data, vendedor, valor)
WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 50)
SELECT
  DATE_SUB('2026-09-01', INTERVAL n * 3 DAY),
  ELT(1 + (n % 5), 'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa'),
  ROUND(500 + (n * 137) % 4500, 2)
FROM seq;

CREATE USER 'leitor'@'%' IDENTIFIED BY 'leitor';
GRANT SELECT ON bi_test.* TO 'leitor'@'%';
