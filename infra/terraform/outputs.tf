output "resource_group_name" {
  description = "Nome do Resource Group exclusivo criado para a aplicação"
  value       = azurerm_resource_group.app.name
}

output "web_app_url" {
  description = "URL pública HTTPS do Hub TatuOS (Azure Container Apps)"
  value       = "https://${azurerm_container_app.web.ingress[0].fqdn}"
}

output "acr_login_server" {
  description = "Servidor de login do Azure Container Registry para push da imagem Docker"
  value       = azurerm_container_registry.acr.login_server
}

output "postgres_fqdn" {
  description = "Host do banco de dados PostgreSQL Flexible Server"
  value       = azurerm_postgresql_flexible_server.postgres.fqdn
}

output "redis_hostname" {
  description = "Host do Azure Cache for Redis"
  value       = azurerm_redis_cache.redis.hostname
}

output "acs_email_sender" {
  description = "Endereço remetente gerenciado pela Azure para envio de notificações de leads"
  value       = local.acs_sender
}

output "key_vault_uri" {
  description = "URI do Azure Key Vault onde os segredos estão salvos"
  value       = azurerm_key_vault.kv.vault_uri
}