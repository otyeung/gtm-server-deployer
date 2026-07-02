locals {
  name_prefix = "gtm-${var.environment}"
  labels = {
    app         = "gtm-server-deployer"
    environment = var.environment
    managed-by  = "terraform"
  }
  required_services = toset([
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "compute.googleapis.com",
    "certificatemanager.googleapis.com",
    "dns.googleapis.com"
  ])
  custom_domain_enabled    = var.custom_domain != ""
  normalized_custom_domain = lower(var.custom_domain)
  cloud_dns_zone_name_raw  = replace("${local.name_prefix}-${local.normalized_custom_domain}", ".", "-")
  cloud_dns_zone_name      = length(local.cloud_dns_zone_name_raw) <= 63 ? local.cloud_dns_zone_name_raw : "${substr(local.cloud_dns_zone_name_raw, 0, 54)}-${substr(sha1(local.normalized_custom_domain), 0, 8)}"
  preview_url_env          = var.enable_preview_server ? google_cloud_run_v2_service.preview[0].uri : ""
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

resource "google_service_account" "cloud_run" {
  account_id   = "${local.name_prefix}-run"
  display_name = "GTM Server Deployer Cloud Run"
  project      = var.project_id

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "gtm_config" {
  project   = var.project_id
  secret_id = "${local.name_prefix}-container-config"
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "gtm_config" {
  secret      = google_secret_manager_secret.gtm_config.id
  secret_data = var.gtm_container_config
}

resource "google_secret_manager_secret_iam_member" "cloud_run_accessor" {
  secret_id = google_secret_manager_secret.gtm_config.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_cloud_run_v2_service" "preview" {
  count               = var.enable_preview_server ? 1 : 0
  project             = var.project_id
  name                = "${local.name_prefix}-preview"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      env {
        name  = "RUN_AS_PREVIEW_SERVER"
        value = "true"
      }

      env {
        name = "CONTAINER_CONFIG"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gtm_config.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.cloud_run_accessor,
    google_secret_manager_secret_version.gtm_config
  ]
}

resource "google_cloud_run_v2_service" "server" {
  project             = var.project_id
  name                = "${local.name_prefix}-server"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = local.labels

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      env {
        name = "CONTAINER_CONFIG"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gtm_config.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "PREVIEW_SERVER_URL"
        value = local.preview_url_env
      }
    }
  }

  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.cloud_run_accessor,
    google_secret_manager_secret_version.gtm_config
  ]
}

resource "google_cloud_run_v2_service_iam_member" "server_public" {
  count    = var.allow_public_ingress ? 1 : 0
  project  = var.project_id
  location = google_cloud_run_v2_service.server.location
  name     = google_cloud_run_v2_service.server.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "preview_public" {
  count    = var.allow_public_ingress && var.enable_preview_server ? 1 : 0
  project  = var.project_id
  location = google_cloud_run_v2_service.preview[0].location
  name     = google_cloud_run_v2_service.preview[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_compute_global_address" "https" {
  count   = local.custom_domain_enabled ? 1 : 0
  project = var.project_id
  name    = "${local.name_prefix}-https-ip"
}

resource "google_compute_region_network_endpoint_group" "serverless" {
  count                 = local.custom_domain_enabled ? 1 : 0
  project               = var.project_id
  name                  = "${local.name_prefix}-server-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.server.name
  }
}

resource "google_compute_backend_service" "server" {
  count                 = local.custom_domain_enabled ? 1 : 0
  project               = var.project_id
  name                  = "${local.name_prefix}-server-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  timeout_sec           = 30

  backend {
    group = google_compute_region_network_endpoint_group.serverless[0].id
  }
}

resource "google_compute_url_map" "https" {
  count           = local.custom_domain_enabled ? 1 : 0
  project         = var.project_id
  name            = "${local.name_prefix}-url-map"
  default_service = google_compute_backend_service.server[0].id

  host_rule {
    hosts        = [local.normalized_custom_domain]
    path_matcher = "gtm"
  }

  path_matcher {
    name            = "gtm"
    default_service = google_compute_backend_service.server[0].id
  }
}

resource "google_certificate_manager_dns_authorization" "domain" {
  count       = local.custom_domain_enabled && var.use_managed_ssl ? 1 : 0
  name        = "${local.name_prefix}-dns-auth"
  description = "DNS authorization for GTM Server custom domain"
  domain      = local.normalized_custom_domain
}

resource "google_certificate_manager_certificate" "domain" {
  count       = local.custom_domain_enabled && var.use_managed_ssl ? 1 : 0
  name        = "${local.name_prefix}-cert"
  description = "Managed certificate for GTM Server custom domain"
  scope       = "DEFAULT"

  managed {
    domains            = [google_certificate_manager_dns_authorization.domain[0].domain]
    dns_authorizations = [google_certificate_manager_dns_authorization.domain[0].id]
  }
}

resource "google_compute_target_https_proxy" "https" {
  count                            = local.custom_domain_enabled ? 1 : 0
  project                          = var.project_id
  name                             = "${local.name_prefix}-https-proxy"
  url_map                          = google_compute_url_map.https[0].id
  certificate_manager_certificates = var.use_managed_ssl ? [google_certificate_manager_certificate.domain[0].id] : []

  lifecycle {
    precondition {
      condition     = !local.custom_domain_enabled || var.use_managed_ssl
      error_message = "custom_domain currently requires use_managed_ssl = true because self-managed certificate inputs are not implemented in this module."
    }
  }
}

resource "google_compute_global_forwarding_rule" "https" {
  count                 = local.custom_domain_enabled ? 1 : 0
  project               = var.project_id
  name                  = "${local.name_prefix}-https-forwarding-rule"
  ip_address            = google_compute_global_address.https[0].id
  port_range            = "443"
  target                = google_compute_target_https_proxy.https[0].id
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_dns_managed_zone" "domain" {
  count       = local.custom_domain_enabled && var.enable_cloud_dns ? 1 : 0
  project     = var.project_id
  name        = local.cloud_dns_zone_name
  dns_name    = "${local.normalized_custom_domain}."
  description = "Managed zone for GTM Server custom domain"
  labels      = local.labels
}

resource "google_dns_record_set" "domain_a" {
  count        = local.custom_domain_enabled && var.enable_cloud_dns ? 1 : 0
  project      = var.project_id
  managed_zone = google_dns_managed_zone.domain[0].name
  name         = "${local.normalized_custom_domain}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.https[0].address]
}

resource "google_dns_record_set" "certificate_auth" {
  count        = local.custom_domain_enabled && var.enable_cloud_dns && var.use_managed_ssl ? 1 : 0
  project      = var.project_id
  managed_zone = google_dns_managed_zone.domain[0].name
  name         = google_certificate_manager_dns_authorization.domain[0].dns_resource_record[0].name
  type         = google_certificate_manager_dns_authorization.domain[0].dns_resource_record[0].type
  ttl          = 300
  rrdatas      = [google_certificate_manager_dns_authorization.domain[0].dns_resource_record[0].data]
}
