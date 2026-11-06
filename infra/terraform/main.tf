locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

data "azurerm_client_config" "current" {}

# Sufixo aleatório para recursos que exigem nomes globalmente únicos na Azure
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# Senha gerada automaticamente para o PostgreSQL
resource "random_password" "postgres_password" {
  length           = 24
  special          = true
  override_special = "_-@#"
}

# JWT_SECRET gerado automaticamente para autenticação (src/lib/jwt.ts)
resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

# ============================================================================
# 1. RESOURCE GROUP EXCLUSIVO DA APLICAÇÃO
# ============================================================================
resource "azurerm_resource_group" "app" {
  name     = "rg-${local.name_prefix}"
  location = var.location
  tags     = local.common_tags
}

# ============================================================================
# 2. OBSERVABILIDADE (Log Analytics + Application Insights)
# ============================================================================
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "log-${local.name_prefix}-${random_string.suffix.result}"
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

resource "azurerm_application_insights" "appinsights" {
  name                = "appi-${local.name_prefix}-${random_string.suffix.result}"
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  workspace_id        = azurerm_log_analytics_workspace.logs.id
  application_type    = "Node.JS"
  tags                = local.common_tags
}

# ============================================================================
# 3. AZURE CONTAINER REGISTRY (ACR)
# ============================================================================
resource "azurerm_container_registry" "acr" {
  name                = "acr${replace(local.name_prefix, "-", "")}${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.app.name
  location            = azurerm_resource_group.app.location
  sku                 = "Basic"
  admin_enabled       = true
  tags                = local.common_tags
}

# ============================================================================
# 4. STORAGE ACCOUNT (Blob Storage para Mídia/Slides + File Share para Cérebro)
# ============================================================================
resource "azurerm_storage_account" "storage" {
  name                     = "st${replace(var.project_name, "-", "")}${var.environment}${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.app.name
  location                 = azurerm_resource_group.app.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"

  blob_properties {
    cors_rule {
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "HEAD", "OPTIONS", "PUT", "POST"]
      allowed_origins    = ["*"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 3600
    }
  }

  tags = local.common_tags
}

resource "azurerm_storage_container" "media" {
  name                  = "tatuos-media"
  storage_account_id    = azurerm_storage_account.storage.id
  container_access_type = "private"
}

resource "azurerm_storage_share" "cerebro" {
  name               = "cerebro-workspace"
  storage_account_id = azurerm_storage_account.storage.id
  quota              = 10
}

# ============================================================================
# 5. BANCO DE DADOS: AZURE DATABASE FOR POSTGRESQL FLEXIBLE SERVER
# ============================================================================
resource "azurerm_postgresql_flexible_server" "postgres" {
  name                   = "psql-${local.name_prefix}-${random_string.suffix.result}"
  resource_group_name    = azurerm_resource_group.app.name
  location               = azurerm_resource_group.app.location
  version                = "16"
  administrator_login    = "tatuosadmin"
  administrator_password = random_password.postgres_password.result
  sku_name               = var.postgres_sku_name
  storage_mb             = var.postgres_storage_mb
  backup_retention_days  = 7
  zone                   = "1"

  public_network_access_enabled = true

  tags = local.common_tags
}

# Regra de Firewall permitindo acesso dos serviços internos da Azure (Container Apps)
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure_services" {
  name             = "AllowAllAzureServicesAndResourcesWithinAzureIps"
  server_id        = azurerm_postgresql_flexible_server.postgres.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_postgresql_flexible_server_database" "tatuos_db" {
  name      = "tatuos"
  server_id = azurerm_postgresql_flexible_server.postgres.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

# ============================================================================
# 6. FILA E CACHE: AZURE CACHE FOR REDIS (BullMQ + Rate Limit/Cache)
# ============================================================================
resource "azurerm_redis_cache" "redis" {
  name                 = "redis-${local.name_prefix}-${random_string.suffix.result}"
  location             = azurerm_resource_group.app.location
  resource_group_name  = azurerm_resource_group.app.name
  capacity             = var.redis_capacity
  family               = var.redis_family
  sku_name             = var.redis_sku_name
  non_ssl_port_enabled = false
  minimum_tls_version  = "1.2"

  redis_configuration {
    maxmemory_policy = "noeviction" # Recomendado pelo BullMQ para não perder jobs da fila
  }

  tags = local.common_tags
}

# ============================================================================
# 7. E-MAIL TRANSACIONAL: AZURE COMMUNICATION SERVICES (ACS)
# ============================================================================
resource "azurerm_email_communication_service" "email_service" {
  name                = "ecs-${local.name_prefix}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.app.name
  data_location       = var.acs_data_location
  tags                = local.common_tags
}

resource "azurerm_email_communication_service_domain" "azure_managed_domain" {
  name             = "AzureManagedDomain"
  email_service_id = azurerm_email_communication_service.email_service.id
  domain_management = "AzureManaged"
}

resource "azurerm_communication_service" "acs" {
  name                = "acs-${local.name_prefix}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.app.name
  data_location       = var.acs_data_location
  tags                = local.common_tags
}

resource "azurerm_communication_service_email_domain_association" "acs_domain_link" {
  communication_service_id = azurerm_communication_service.acs.id
  email_service_domain_id  = azurerm_email_communication_service_domain.azure_managed_domain.id
}

# ============================================================================
# 8. SEGURANÇA: AZURE KEY VAULT (Cofre de Credenciais)
# ============================================================================
resource "azurerm_key_vault" "kv" {
  name                       = "kv-${var.project_name}-${random_string.suffix.result}"
  location                   = azurerm_resource_group.app.location
  resource_group_name        = azurerm_resource_group.app.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  purge_protection_enabled   = false
  soft_delete_retention_days = 7

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = [
      "Get", "List", "Set", "Delete", "Purge", "Recover"
    ]
  }

  tags = local.common_tags
}

locals {
  database_url = "postgresql://${azurerm_postgresql_flexible_server.postgres.administrator_login}:${urlencode(random_password.postgres_password.result)}@${azurerm_postgresql_flexible_server.postgres.fqdn}:5432/${azurerm_postgresql_flexible_server_database.tatuos_db.name}?sslmode=require"
  redis_url    = "rediss://:${urlencode(azurerm_redis_cache.redis.primary_access_key)}@${azurerm_redis_cache.redis.hostname}:${azurerm_redis_cache.redis.ssl_port}"
  acs_sender   = "DoNotReply@${azurerm_email_communication_service_domain.azure_managed_domain.from_sender_domain}"
}

resource "azurerm_key_vault_secret" "db_url" {
  name         = "DATABASE-URL"
  value        = local.database_url
  key_vault_id = azurerm_key_vault.kv.id
}

resource "azurerm_key_vault_secret" "redis_url" {
  name         = "REDIS-URL"
  value        = local.redis_url
  key_vault_id = azurerm_key_vault.kv.id
}

resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "JWT-SECRET"
  value        = random_password.jwt_secret.result
  key_vault_id = azurerm_key_vault.kv.id
}

resource "azurerm_key_vault_secret" "anthropic_key" {
  name         = "ANTHROPIC-API-KEY"
  value        = var.anthropic_api_key
  key_vault_id = azurerm_key_vault.kv.id
}

# ============================================================================
# 9. COMPUTE: AZURE CONTAINER APPS ENVIRONMENT
# ============================================================================
resource "azurerm_container_app_environment" "env" {
  name                       = "cae-${local.name_prefix}"
  location                   = azurerm_resource_group.app.location
  resource_group_name        = azurerm_resource_group.app.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  tags                       = local.common_tags
}

resource "azurerm_container_app_environment_storage" "cerebro_mount" {
  name                         = "cerebro-storage"
  container_app_environment_id = azurerm_container_app_environment.env.id
  account_name                 = azurerm_storage_account.storage.name
  access_key                   = azurerm_storage_account.storage.primary_access_key
  share_name                   = azurerm_storage_share.cerebro.name
  access_mode                  = "ReadWrite"
}

# ============================================================================
# 10. CONTAINER APP 1: WEB HUB (Next.js 16 + Rotas de API + LP Public + Playwright)
# ============================================================================
resource "azurerm_container_app" "web" {
  name                         = "ca-${local.name_prefix}-web"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.app.name
  revision_mode                = "Single"
  tags                         = local.common_tags

  registry {
    server               = azurerm_container_registry.acr.login_server
    username             = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.acr.admin_password
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }

  secret {
    name  = "redis-url"
    value = local.redis_url
  }

  secret {
    name  = "jwt-secret"
    value = random_password.jwt_secret.result
  }

  secret {
    name  = "anthropic-api-key"
    value = var.anthropic_api_key
  }

  secret {
    name  = "storage-conn"
    value = azurerm_storage_account.storage.primary_connection_string
  }

  secret {
    name  = "acs-conn"
    value = azurerm_communication_service.acs.primary_connection_string
  }

  secret {
    name  = "meta-app-secret"
    value = var.meta_app_secret != "" ? var.meta_app_secret : "not-configured"
  }

  secret {
    name  = "linkedin-client-secret"
    value = var.linkedin_client_secret != "" ? var.linkedin_client_secret : "not-configured"
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "auto"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "tatuos-web"
      image  = "${azurerm_container_registry.acr.login_server}/tatuos-sistema:${var.docker_image_tag}"
      cpu    = 1.0
      memory = "2Gi" # 2Gi garante folga para o Chromium Headless (Playwright) renderizar carrosséis

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "HOSTNAME"
        value = "0.0.0.0"
      }
      env {
        name  = "WORKSPACE_PATH"
        value = "/app/cerebro"
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "DIRECT_URL"
        secret_name = "database-url"
      }
      env {
        name        = "REDIS_URL"
        secret_name = "redis-url"
      }
      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }
      env {
        name        = "ANTHROPIC_API_KEY"
        secret_name = "anthropic-api-key"
      }
      env {
        name  = "CLAUDE_MODEL"
        value = var.claude_model
      }
      env {
        name        = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-conn"
      }
      env {
        name  = "AZURE_STORAGE_CONTAINER_NAME"
        value = azurerm_storage_container.media.name
      }
      env {
        name        = "AZURE_COMMUNICATION_CONNECTION_STRING"
        secret_name = "acs-conn"
      }
      env {
        name  = "AZURE_EMAIL_SENDER"
        value = local.acs_sender
      }
      env {
        name  = "SUPER_ADMIN_EMAIL"
        value = var.super_admin_email
      }
      env {
        name  = "META_APP_ID"
        value = var.meta_app_id
      }
      env {
        name        = "META_APP_SECRET"
        secret_name = "meta-app-secret"
      }
      env {
        name  = "LINKEDIN_CLIENT_ID"
        value = var.linkedin_client_id
      }
      env {
        name        = "LINKEDIN_CLIENT_SECRET"
        secret_name = "linkedin-client-secret"
      }
      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = var.custom_app_url != "" ? var.custom_app_url : "https://ca-${local.name_prefix}-web.${azurerm_container_app_environment.env.default_domain}"
      }
      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.appinsights.connection_string
      }
    }
  }
}

# ============================================================================
# 11. CONTAINER APP 2: WORKER BULLMQ (Filas, Agendamento Social e Renderização)
# ============================================================================
resource "azurerm_container_app" "worker" {
  name                         = "ca-${local.name_prefix}-worker"
  container_app_environment_id = azurerm_container_app_environment.env.id
  resource_group_name          = azurerm_resource_group.app.name
  revision_mode                = "Single"
  tags                         = local.common_tags

  registry {
    server               = azurerm_container_registry.acr.login_server
    username             = azurerm_container_registry.acr.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.acr.admin_password
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }

  secret {
    name  = "redis-url"
    value = local.redis_url
  }

  secret {
    name  = "anthropic-api-key"
    value = var.anthropic_api_key
  }

  secret {
    name  = "storage-conn"
    value = azurerm_storage_account.storage.primary_connection_string
  }

  secret {
    name  = "acs-conn"
    value = azurerm_communication_service.acs.primary_connection_string
  }

  template {
    min_replicas = 1
    max_replicas = 2

    container {
      name    = "tatuos-worker"
      image   = "${azurerm_container_registry.acr.login_server}/tatuos-sistema:${var.docker_image_tag}"
      cpu     = 1.0
      memory  = "2Gi"
      command = ["npx", "tsx", "sistema/src/worker/index.ts"]

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "WORKSPACE_PATH"
        value = "/app/cerebro"
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "DIRECT_URL"
        secret_name = "database-url"
      }
      env {
        name        = "REDIS_URL"
        secret_name = "redis-url"
      }
      env {
        name        = "ANTHROPIC_API_KEY"
        secret_name = "anthropic-api-key"
      }
      env {
        name  = "CLAUDE_MODEL"
        value = var.claude_model
      }
      env {
        name        = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-conn"
      }
      env {
        name  = "AZURE_STORAGE_CONTAINER_NAME"
        value = azurerm_storage_container.media.name
      }
      env {
        name        = "AZURE_COMMUNICATION_CONNECTION_STRING"
        secret_name = "acs-conn"
      }
      env {
        name  = "AZURE_EMAIL_SENDER"
        value = local.acs_sender
      }
      env {
        name  = "NEXT_PUBLIC_APP_URL"
        value = var.custom_app_url != "" ? var.custom_app_url : "https://ca-${local.name_prefix}-web.${azurerm_container_app_environment.env.default_domain}"
      }
      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.appinsights.connection_string
      }
    }
  }
}