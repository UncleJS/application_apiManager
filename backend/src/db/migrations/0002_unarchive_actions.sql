INSERT IGNORE INTO deny_reasons (code, message) VALUES
  ('ORG_ARCHIVED', 'Organization archived');
--> statement-breakpoint

INSERT IGNORE INTO audit_actions (code) VALUES
  ('ORG_UNARCHIVE'),
  ('USER_UNARCHIVE'),
  ('API_UNARCHIVE'),
  ('WINDOW_UNARCHIVE');
