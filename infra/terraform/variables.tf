variable "project_name" {
  description = "Nome base do projeto para nomenclatura dos recursos"
  type        = string
  default     = "tatuos"
}

variable "environment" {
  description = "Ambiente de deploy (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "location" {
  description = "Região principal da Azure para os recursos da aplicação"
  type        = string
  default     = "brazilsouth"
}

variable "acs_data_location" {
  description = "Localização de dados do Azure Communication Services (ex: United States, Brazil)"
  type        = string
  default     = "United States"
}

variable "docker_image_tag" {
  description = "Tag da imagem Docker no ACR para o Web e o Worker"
  type        = string
  default     = "latest"
}

# ============================================================================
# SKUs e Dimensionamento
# ============================================================================
variable "postgres_sku_name" {
  description = "SKU do PostgreSQL Flexible Server"
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_storage_mb" {
  description = "Armazenamento do PostgreSQL em MB"
  type        = number
  default     = 32768
}

variable "redis_sku_name" {
  description = "SKU do Azure Cache for Redis (Basic, Standard, Premium)"
  type        = string
  default     = "Basic"
}

variable "redis_family" {
  description = "Família de capacidade do Redis (C para Basic/Standard, P para Premium)"
  type        = string
  default     = "C"
}

variable "redis_capacity" {
  description = "Tamanho da instância do Redis (0 = 250MB, 1 = 1GB, etc.)"
  type        = number
  default     = 0
}

# ============================================================================
# Segredos da Aplicação (TatuOS SaaS)
# ============================================================================
variable "anthropic_api_key" {
  description = "Chave da API da Anthropic (Claude) usada nas gerações de IA"
  type        = string
  sensitive   = true
}

variable "claude_model" {
  description = "Modelo padrão do Claude utilizado pelo motor de IA"
  type        = string
  default     = "claude-sonnet-4-5"
}

variable "super_admin_email" {
  description = "E-mail inicial do SUPER_ADMIN"
  type        = string
  default     = "admin@stageconsulting.com.br"
}

variable "meta_app_id" {
  description = "App ID da Meta (Instagram OAuth)"
  type        = string
  default     = ""
}

variable "meta_app_secret" {
  description = "App Secret da Meta (Instagram OAuth)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "linkedin_client_id" {
  description = "Client ID do LinkedIn OAuth"
  type        = string
  default     = ""
}

variable "linkedin_client_secret" {
  description = "Client Secret do LinkedIn OAuth"
  type        = string
  sensitive   = true
  default     = ""
}

variable "custom_app_url" {
  description = "Domínio público customizado do Hub (deixe vazio para usar o FQDN gerado pelo Container App)"
  type        = string
  default     = ""
}