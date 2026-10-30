-- SPACE-EYE database schema (MySQL 8+)
-- Create the database, then run this file:
--   mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS spaceeye
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE spaceeye;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(180)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- locations
-- Optional lookup table for named locations shown on the map / history.
-- analyses.location_name is kept denormalized for simplicity, but a
-- location can also be linked here for reuse across analyses.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(180) NOT NULL,
  latitude    DECIMAL(9,6) NOT NULL,
  longitude   DECIMAL(9,6) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_location (name, latitude, longitude)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- analyses
-- One row per analysis run (agriculture / water / forest).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analyses (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  user_id               INT NOT NULL,
  location_id           INT NULL,

  analysis_type         ENUM('agriculture','water','forest') NOT NULL,
  location_name         VARCHAR(180),
  latitude              DECIMAL(9,6),
  longitude             DECIMAL(9,6),

  status                ENUM('completed','failed') NOT NULL DEFAULT 'completed',
  is_demo               TINYINT(1) NOT NULL DEFAULT 0,

  result_summary        VARCHAR(255),
  original_image_path   VARCHAR(400),
  secondary_image_path  VARCHAR(400),
  result_image_path     VARCHAR(400),

  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_analyses_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_analyses_location
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,

  INDEX idx_analyses_user (user_id),
  INDEX idx_analyses_type (analysis_type),
  INDEX idx_analyses_created (created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- analysis_results
-- Wide, queryable metric columns per analysis, kept alongside the JSON
-- blob the API returns, so common metrics can be filtered/sorted in SQL
-- without parsing JSON (e.g. "show all water analyses > 20% coverage").
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis_results (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  analysis_id       INT NOT NULL,

  -- agriculture
  healthy_pct       DECIMAL(5,2),
  moderate_pct      DECIMAL(5,2),
  stressed_pct      DECIMAL(5,2),
  vegetation_coverage_pct DECIMAL(5,2),

  -- water
  water_coverage_pct DECIMAL(5,2),
  total_pixels      BIGINT,

  -- forest
  veg_before_pct    DECIMAL(5,2),
  veg_after_pct     DECIMAL(5,2),
  change_pct        DECIMAL(5,2),
  classification    VARCHAR(40),

  result_json       JSON,

  CONSTRAINT fk_results_analysis
    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE,
  INDEX idx_results_analysis (analysis_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- reports
-- Generated PDF report records, one per "Generate Report" click.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  analysis_id   INT NOT NULL,
  file_path     VARCHAR(400) NOT NULL,
  generated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_reports_analysis
    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Note: the Flask app defaults to SQLite (zero setup) and models the same
-- shape via SQLAlchemy (see backend/models/). Point DATABASE_URL at this
-- MySQL schema (mysql+pymysql://user:pass@host/spaceeye) to use it instead;
-- SQLAlchemy will create matching tables automatically on first run.
