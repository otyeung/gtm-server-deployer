mock_provider "google" {}

run "requires_managed_ssl_for_custom_domains" {
  command = plan

  variables {
    project_id           = "abcde-12345"
    gtm_container_config = "dummy-config"
    custom_domain        = "Example.COM"
    use_managed_ssl      = false
  }

  expect_failures = [
    var.use_managed_ssl,
  ]
}

run "rejects_invalid_custom_domain_values" {
  command = plan

  variables {
    project_id           = "abcde-12345"
    gtm_container_config = "dummy-config"
    custom_domain        = "bad domain"
    use_managed_ssl      = true
  }

  expect_failures = [
    var.custom_domain,
  ]
}

run "rejects_whitespace_padded_custom_domain_values" {
  command = plan

  variables {
    project_id           = "abcde-12345"
    gtm_container_config = "dummy-config"
    custom_domain        = " bad.example.com "
    use_managed_ssl      = true
  }

  expect_failures = [
    var.custom_domain,
  ]
}

run "normalizes_custom_domain_derived_values" {
  command = plan

  variables {
    project_id           = "abcde-12345"
    gtm_container_config = "dummy-config"
    custom_domain        = "Example.COM"
    enable_cloud_dns     = true
  }

  assert {
    condition     = contains(flatten([for rule in google_compute_url_map.https[0].host_rule : rule.hosts]), "example.com")
    error_message = "Expected URL map hosts to use lowercase custom_domain."
  }

  assert {
    condition     = google_certificate_manager_dns_authorization.domain[0].domain == "example.com"
    error_message = "Expected certificate DNS authorization domain to be lowercase."
  }

  assert {
    condition     = google_dns_managed_zone.domain[0].name == "gtm-dev-example-com"
    error_message = "Expected managed zone names to derive from the lowercase custom domain."
  }

  assert {
    condition     = google_dns_managed_zone.domain[0].dns_name == "example.com."
    error_message = "Expected managed zone DNS names to use lowercase custom_domain."
  }

  assert {
    condition     = google_dns_record_set.domain_a[0].name == "example.com."
    error_message = "Expected Cloud DNS record names to use lowercase custom_domain."
  }

  assert {
    condition     = output.https_url == "https://example.com"
    error_message = "Expected HTTPS output URL to use lowercase custom_domain."
  }
}
