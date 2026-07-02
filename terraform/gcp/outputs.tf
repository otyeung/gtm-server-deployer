output "server_url" {
  description = "Cloud Run URL for the GTM Server Container."
  value       = google_cloud_run_v2_service.server.uri
}

output "preview_url" {
  description = "Cloud Run URL for the Preview Server, or null when disabled."
  value       = var.enable_preview_server ? google_cloud_run_v2_service.preview[0].uri : null
}

output "server_service_name" {
  description = "Cloud Run GTM server service name."
  value       = google_cloud_run_v2_service.server.name
}

output "preview_service_name" {
  description = "Cloud Run Preview Server service name, or null when disabled."
  value       = var.enable_preview_server ? google_cloud_run_v2_service.preview[0].name : null
}

output "region" {
  description = "Deployment region."
  value       = var.region
}

output "https_url" {
  description = "Custom HTTPS URL when a custom domain is configured."
  value       = var.custom_domain != "" ? "https://${lower(var.custom_domain)}" : null
}

output "load_balancer_ip" {
  description = "Global load balancer IP address when custom domain is configured."
  value       = var.custom_domain != "" ? google_compute_global_address.https[0].address : null
}

output "certificate_name" {
  description = "Certificate Manager certificate name when custom domain is configured."
  value       = var.custom_domain != "" && var.use_managed_ssl ? google_certificate_manager_certificate.domain[0].name : null
}
