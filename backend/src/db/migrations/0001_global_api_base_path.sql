ALTER TABLE api_definitions
  ADD INDEX idx_api_org (organization_id);
--> statement-breakpoint
ALTER TABLE api_definitions DROP INDEX uq_api_org_path;
--> statement-breakpoint
ALTER TABLE api_definitions
  ADD CONSTRAINT uq_api_base_path UNIQUE (base_path);
