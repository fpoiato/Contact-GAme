variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "contact-game"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "websocket_url" {
  type        = string
  description = "WebSocket URL from CDK output (wss://...)"
  default     = ""
}

variable "domain_name" {
  type    = string
  default = "contact.fpoiato.com"
}

variable "route53_zone_id" {
  type    = string
  default = "Z094351536ZBINA5SU45F"
}

variable "github_owner" {
  type    = string
  default = "fpoiato"
}

variable "github_repo" {
  type    = string
  default = "Contact-GAme"
}

variable "github_branch" {
  type    = string
  default = "main"
}

variable "codestar_connection_arn" {
  type        = string
  description = "ARN of CodeStar Connections GitHub connection"
  default     = "arn:aws:codestar-connections:us-east-1:986873053420:connection/69600f12-ec9d-4750-8e2f-ca6cf7b45ade"
}
