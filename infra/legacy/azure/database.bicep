targetScope = 'resourceGroup'

@description('Location')
param location string = resourceGroup().location

@description('Server name')
param postgresName string

@description('Database name')
param postgresDbName string

@description('Admin login')
param administratorLogin string = 'pgadmin'

@secure()
@description('Admin password')
param administratorLoginPassword string

@description('VNet/Subnet names')
param vnetName string = 'portfolio-vnet'
param pgSubnetName string = 'pgSubnet'

var pgSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, pgSubnetName)
var dnsPgId    = resourceId('Microsoft.Network/privateDnsZones', 'privatelink.postgres.database.azure.com')

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresName
  location: location
  sku: { name: 'Standard_B2s', tier: 'Burstable' }
  properties: {
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    version: '17'
    storage: { storageSizeGB: 32, autoGrow: 'Enabled' }
    highAvailability: { mode: 'Disabled' }
    availabilityZone: '1'
    network: {
      delegatedSubnetResourceId: pgSubnetId
      privateDnsZoneArmResourceId: dnsPgId
    }
    dataEncryption: { type: 'SystemManaged' }
  }
  dependsOn: []
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  name: postgresDbName
  parent: postgres
}
