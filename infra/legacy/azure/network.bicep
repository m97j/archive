targetScope = 'resourceGroup'

@description('Location (region)')
param location string = resourceGroup().location

@description('Virtual network name')
param vnetName string = 'portfolio-vnet'

@description('Subnets')
param appSubnetName string = 'appSubnet'
param pgSubnetName  string = 'pgSubnet'
param peSubnetName  string = 'peSubnet'

resource vnet 'Microsoft.Network/virtualNetworks@2023-05-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: { addressPrefixes: [ '10.10.0.0/16' ] }
    subnets: [
      {
        name: appSubnetName
        properties: {
          addressPrefix: '10.10.1.0/24'
          delegations: [
            {
              name: 'appServiceDelegation'
              properties: { serviceName: 'Microsoft.Web/serverFarms' }
            }
          ]
        }
      }
      {
        name: pgSubnetName
        properties: {
          addressPrefix: '10.10.2.0/24'
          delegations: [
            {
              name: 'pgDelegation'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
      }
      {
        name: peSubnetName
        properties: {
          addressPrefix: '10.10.3.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

// Exported IDs for other modules (computed via resourceId in their own files)
