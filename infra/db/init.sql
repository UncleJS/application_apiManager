CREATE DATABASE IF NOT EXISTS api_manager;
USE api_manager;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS user_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS organization_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  status_id INT NOT NULL,
  created_at_utc DATETIME NOT NULL,
  updated_at_utc DATETIME NOT NULL,
  CONSTRAINT fk_org_status FOREIGN KEY (status_id) REFERENCES organization_statuses(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  organization_id INT NOT NULL,
  role_id INT NOT NULL,
  status_id INT NOT NULL,
  created_at_utc DATETIME NOT NULL,
  updated_at_utc DATETIME NOT NULL,
  CONSTRAINT fk_user_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_user_status FOREIGN KEY (status_id) REFERENCES user_statuses(id)
);

CREATE TABLE IF NOT EXISTS api_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  base_path VARCHAR(200) NOT NULL,
  target_url VARCHAR(500) NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  always_on TINYINT(1) NOT NULL DEFAULT 0,
  created_at_utc DATETIME NOT NULL,
  updated_at_utc DATETIME NOT NULL,
  CONSTRAINT fk_api_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  UNIQUE KEY uq_api_org_path (organization_id, base_path)
);

CREATE TABLE IF NOT EXISTS user_api_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  api_id INT NOT NULL,
  created_at_utc DATETIME NOT NULL,
  CONSTRAINT fk_perm_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_perm_api FOREIGN KEY (api_id) REFERENCES api_definitions(id),
  UNIQUE KEY uq_user_api (user_id, api_id)
);

CREATE TABLE IF NOT EXISTS access_windows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_type VARCHAR(10) NOT NULL,
  subject_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at_utc DATETIME NOT NULL,
  INDEX idx_windows_subject (subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS deny_reasons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  message VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS audit_entities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  user_id INT NULL,
  api_id INT NOT NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  status INT NOT NULL,
  request_bytes INT NOT NULL,
  response_bytes INT NOT NULL,
  duration_ms INT NOT NULL,
  client_ip VARCHAR(64) NOT NULL,
  deny_reason_id INT NULL,
  created_at_utc DATETIME NOT NULL,
  CONSTRAINT fk_access_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_access_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_access_api FOREIGN KEY (api_id) REFERENCES api_definitions(id),
  CONSTRAINT fk_access_reason FOREIGN KEY (deny_reason_id) REFERENCES deny_reasons(id),
  INDEX idx_access_org_time (organization_id, created_at_utc),
  INDEX idx_access_user_time (user_id, created_at_utc),
  INDEX idx_access_time (created_at_utc)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  user_id INT NOT NULL,
  action_id INT NOT NULL,
  entity_id INT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at_utc DATETIME NOT NULL,
  CONSTRAINT fk_audit_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_audit_action FOREIGN KEY (action_id) REFERENCES audit_actions(id),
  CONSTRAINT fk_audit_entity FOREIGN KEY (entity_id) REFERENCES audit_entities(id)
);

INSERT IGNORE INTO roles (name) VALUES
  ('global_admin'),
  ('org_admin'),
  ('user');

INSERT IGNORE INTO user_statuses (name) VALUES
  ('active'),
  ('archived');

INSERT IGNORE INTO organization_statuses (name) VALUES
  ('active'),
  ('archived');

INSERT IGNORE INTO deny_reasons (code, message) VALUES
  ('API_NOT_FOUND', 'API not found'),
  ('API_DISABLED', 'API disabled'),
  ('API_OUTSIDE_ALLOWED_HOURS', 'API outside allowed hours'),
  ('AUTH_REQUIRED', 'Authorization required'),
  ('INVALID_TOKEN', 'Invalid token'),
  ('USER_ARCHIVED', 'User archived'),
  ('USER_NOT_ASSIGNED_TO_API', 'User not assigned to API'),
  ('USER_OUTSIDE_ALLOWED_HOURS', 'User outside allowed hours'),
  ('USER_ORG_MISMATCH', 'User organization mismatch'),
  ('UPSTREAM_ERROR', 'Upstream request failed');

INSERT IGNORE INTO audit_actions (code) VALUES
  ('ORG_CREATE'),
  ('ORG_UPDATE'),
  ('ORG_ARCHIVE'),
  ('USER_CREATE'),
  ('USER_UPDATE'),
  ('USER_ARCHIVE'),
  ('API_CREATE'),
  ('API_UPDATE'),
  ('API_ARCHIVE'),
  ('PERMISSION_ASSIGN'),
  ('PERMISSION_UNASSIGN'),
  ('WINDOW_CREATE'),
  ('WINDOW_UPDATE'),
  ('WINDOW_ARCHIVE');

INSERT IGNORE INTO audit_entities (name) VALUES
  ('org'),
  ('user'),
  ('api'),
  ('permission'),
  ('window');
