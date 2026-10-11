targetScope = 'resourceGroup'

@description('Backend App Service name')
param backendAppName string

@description('Frontend outbound IPs (comma-separated string)')
param frontendOutboundIps string

resource backendApp 'Microsoft.Web/sites@2022-09-01' existing = {
  name: backendAppName
}

// 문자열을 배열로 변환
var ipArray = split(frontendOutboundIps, ',')

// IP 허용 규칙 정의 (이름은 짧게, 32자 이하)
var allowFrontendIps = [
  for (ip, i) in ipArray: {
    name: 'AllowFrontend${i}'   // 짧고 고유한 이름
    action: 'Allow'
    ipAddress: '${ip}/32'
    priority: 100 + i
    description: 'Allow only Frontend outbound IP'
  }
]

resource backendAccessRestrictions 'Microsoft.Web/sites/config@2022-09-01' = {
  name: 'web'
  parent: backendApp
  properties: {
    ipSecurityRestrictions: concat(
      allowFrontendIps,
      [
        {
          name: 'Deny-All'
          action: 'Deny'
          ipAddress: '0.0.0.0/0'
          priority: 200
          description: 'Deny all other traffic'
        }
      ]
    )
  }
}
