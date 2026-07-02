variable "project_id" {
  type        = string
  description = "Google Cloud project ID that receives GTM Server-Side resources."

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "region" {
  type        = string
  description = "Google Cloud region for Cloud Run resources."
  default     = "asia-southeast1"
}

variable "environment" {
  type        = string
  description = "Deployment environment label."
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "container_image" {
  type        = string
  description = "GTM Server-Side container image."
  default     = "gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable"
}

variable "cpu" {
  type        = string
  description = "Cloud Run CPU limit."
  default     = "1"
}

variable "memory" {
  type        = string
  description = "Cloud Run memory limit."
  default     = "512Mi"
}

variable "min_instances" {
  type        = number
  description = "Minimum Cloud Run instances."
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Maximum Cloud Run instances."
  default     = 3
}

variable "gtm_container_config" {
  type        = string
  description = "Sensitive GTM server container configuration string."
  sensitive   = true
}

variable "enable_preview_server" {
  type        = bool
  description = "Whether to deploy the GTM Preview Server."
  default     = true
}

variable "use_https" {
  type        = bool
  description = "Whether HTTPS endpoints should be used."
  default     = true
}

variable "use_managed_ssl" {
  type        = bool
  description = "Whether Google-managed SSL should be used when custom_domain is set."
  default     = true

  validation {
    condition     = var.custom_domain == "" || var.use_managed_ssl
    error_message = "custom_domain currently requires use_managed_ssl = true because self-managed certificate inputs are not implemented in this module."
  }
}

variable "custom_domain" {
  type        = string
  description = "Optional custom domain for the HTTPS load balancer."
  default     = ""
}

variable "enable_cloud_dns" {
  type        = bool
  description = "Whether Terraform should create Cloud DNS records for custom_domain."
  default     = false
}

variable "allow_public_ingress" {
  type        = bool
  description = "Whether Cloud Run services should allow public invoker access."
  default     = true
}
