mock_provider "google" {}

run "keeps_default_services_minimal_without_custom_domain" {
  command = plan

  variables {
    project_id           = "abcde-12345"
    gtm_container_config = "dummy-config"
  }

  assert {
    condition     = !contains(keys(google_project_service.required), "compute.googleapis.com")
    error_message = "Expected default Cloud Run deployments to skip the Compute API."
  }

  assert {
    condition     = !contains(keys(google_project_service.required), "certificatemanager.googleapis.com")
    error_message = "Expected default Cloud Run deployments to skip the Certificate Manager API."
  }

  assert {
    condition     = !contains(keys(google_project_service.required), "dns.googleapis.com")
    error_message = "Expected default Cloud Run deployments to skip the Cloud DNS API."
  }
}

run "enables_custom_domain_services_only_when_needed" {
  command = plan

  variables {
    project_id           = "abcde-12345"
    gtm_container_config = "dummy-config"
    custom_domain        = "gtm.example.com"
    enable_cloud_dns     = true
  }

  assert {
    condition     = contains(keys(google_project_service.required), "compute.googleapis.com")
    error_message = "Expected custom domains to enable the Compute API."
  }

  assert {
    condition     = contains(keys(google_project_service.required), "certificatemanager.googleapis.com")
    error_message = "Expected managed custom domains to enable the Certificate Manager API."
  }

  assert {
    condition     = contains(keys(google_project_service.required), "dns.googleapis.com")
    error_message = "Expected Cloud DNS automation to enable the Cloud DNS API."
  }
}
