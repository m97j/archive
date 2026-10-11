targetScope = 'resourceGroup'

@description('Location')
param location string = resourceGroup().location

@description('Registry name')
param registryName string

resource acr 'Microsoft.ContainerRegistry/registries@2023-01-01-preview' = {
  name: registryName
  location: location
  sku: { name: 'Basic' }
  properties: {}
}
