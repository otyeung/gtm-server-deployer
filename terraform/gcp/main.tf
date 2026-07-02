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
  custom_domain_enabled = var.custom_domain != ""
  preview_url_env       = var.enable_preview_server ? google_cloud_run_v2_service.preview[0].uri : ""
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
