targetScope = 'resourceGroup'

@description('Location')
param location string = resourceGroup().location

@description('Key Vault name')
param keyVaultName string

@secure()
@description('JWT signing secret')
param jwtSecret string

@secure()
@description('Postgres admin password (for secret copy)')
param administratorLoginPassword string

@description('Storage account name (for secret copy)')
param storageAccountName string

@description('VNet/Subnet names')
param vnetName string = 'portfolio-vnet'
param peSubnetName string = 'peSubnet'

var peSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, peSubnetName)
var dnsKvId    = resourceId('Microsoft.Network/privateDnsZones', 'privatelink.vaultcore.azure.net')

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
  }
}

resource kvPe 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-keyvault'
  location: location
  properties: {
    subnet: { id: peSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'pe-kv-conn'
        properties: {
          privateLinkServiceId: kv.id
          groupIds: [ 'vault' ]
        }
      }
    ]
  }
}

resource kvPeDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2020-03-01' = {
  name: 'kv-dnsgrp'
  parent: kvPe
  properties: {
    privateDnsZoneConfigs: [
      { name: 'kvzone', properties: { privateDnsZoneId: dnsKvId } }
    ]
  }
}

// Secrets: storage key, postgres password, jwt
resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}
var storageKeys = sa.listKeys()
var storageKey  = storageKeys.keys[0].value

resource storageKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'AZURE-STORAGE-KEY'
  parent: kv
  properties: { value: storageKey }
}

resource dbPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'POSTGRES-PASSWORD'
  parent: kv
  properties: { value: administratorLoginPassword }
}

resource jwtSecretRes 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'JWT-SECRET'
  parent: kv
  properties: { value: jwtSecret }
}
