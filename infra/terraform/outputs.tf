output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "app_url" {
  value = "https://${var.domain_name}"
}

output "s3_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "codepipeline_name" {
  value = aws_codepipeline.contact.name
}

output "acm_certificate_arn" {
  value = aws_acm_certificate.frontend.arn
}

output "codestar_connection_arn" {
  value       = aws_codestarconnections_connection.github.arn
  description = "Complete GitHub authorization in AWS Console (Developer Tools > Connections), then retry the pipeline."
}

output "codestar_connection_status" {
  value = aws_codestarconnections_connection.github.connection_status
}
