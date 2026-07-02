# AWS Terraform Module

AWS deployment is outside the GCP MVP. The intended AWS architecture is:

- ECR for container image hosting when a custom image is needed
- App Runner or ECS Fargate for the GTM server and preview server
- ACM for managed certificates
- Application Load Balancer for HTTPS routing
- Route 53 for DNS automation
- CloudWatch for logs and metrics

This directory exists so the repository structure communicates the multi-cloud roadmap while keeping the first release focused on GCP.

## License

Licensed under the Apache License, Version 2.0. See the repository [LICENSE](../../LICENSE) file for details.
