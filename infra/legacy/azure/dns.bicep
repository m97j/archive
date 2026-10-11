targetScope = 'resourceGroup'

@description('VNet name to link')
param vnetName string = 'portfolio-vnet'

var vnetId = resourceId('Microsoft.Network/virtualNetworks', vnetName)

// --------------------
// Private DNS Zones
// --------------------
resource dnsPg 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.postgres.database.azure.com'
  location: 'global'
}

resource dnsBlob 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.blob.${environment().suffixes.storage}'
  location: 'global'
}

resource dnsKv 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
}

// --------------------
// Virtual Network Links (parent 속성 사용)
// --------------------
resource linkPg 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  name: 'pg-link'
  parent: dnsPg
  location: 'global'
  properties: {
    virtualNetwork: { id: vnetId }
    registrationEnabled: false
  }
}

resource linkBlob 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  name: 'blob-link'
  parent: dnsBlob
  location: 'global'
  properties: {
    virtualNetwork: { id: vnetId }
    registrationEnabled: false
  }
}

resource linkKv 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  name: 'kv-link'
  parent: dnsKv
  location: 'global'
  properties: {
    virtualNetwork: { id: vnetId }
    registrationEnabled: false
  }
}
