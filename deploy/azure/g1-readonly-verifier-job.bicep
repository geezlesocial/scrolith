targetScope = 'resourceGroup'

@description('Resource ID of the already-existing staging Container Apps environment. Verify ownership/environment before deployment.')
param stagingEnvironmentResourceId string

@description('Azure region matching the existing staging Container Apps environment.')
param stagingLocation string

@description('User-assigned identity used only for pulling this image from the staging ACR.')
param stagingAcrPullIdentityResourceId string

@description('Dedicated identity used by ACA to resolve this Job’s Key Vault secret references.')
param verifierKeyVaultIdentityResourceId string

@description('The 64 hexadecimal characters of the reviewed immutable SHA-256 image digest; validate lowercase hexadecimal before deployment.')
@minLength(64)
@maxLength(64)
param imageDigestHex string

@description('Versioned Key Vault secret URI containing the approved staging DATABASE_URL. Never a raw value.')
@secure()
param databaseUrlKeyVaultSecretUri string

@description('Versioned Key Vault secret URI for Member A selector. Never a raw value.')
@secure()
param memberASelectorKeyVaultSecretUri string

@description('Versioned Key Vault secret URI for Member B selector. Never a raw value.')
@secure()
param memberBSelectorKeyVaultSecretUri string

var stagingAcrLoginServer = 'acrscrolithstaging8098.azurecr.io'
var verifierImage = '${stagingAcrLoginServer}/scrolith-g1-readonly-verifier@sha256:${imageDigestHex}'
var userAssignedIdentities = {
  '${stagingAcrPullIdentityResourceId}': {}
  '${verifierKeyVaultIdentityResourceId}': {}
}

resource verifierJob 'Microsoft.App/jobs@2026-01-01' = {
  name: 'job-scrolith-g1-readonly-verifier'
  location: stagingLocation
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: userAssignedIdentities
  }
  properties: {
    environmentId: stagingEnvironmentResourceId
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 120
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: stagingAcrLoginServer
          identity: stagingAcrPullIdentityResourceId
        }
      ]
      secrets: [
        {
          name: 'g1-database-url'
          keyVaultUrl: databaseUrlKeyVaultSecretUri
          identity: verifierKeyVaultIdentityResourceId
        }
        {
          name: 'g1-member-a-selector'
          keyVaultUrl: memberASelectorKeyVaultSecretUri
          identity: verifierKeyVaultIdentityResourceId
        }
        {
          name: 'g1-member-b-selector'
          keyVaultUrl: memberBSelectorKeyVaultSecretUri
          identity: verifierKeyVaultIdentityResourceId
        }
      ]
      identitySettings: [
        {
          identity: stagingAcrPullIdentityResourceId
          lifecycle: 'None'
        }
        {
          identity: verifierKeyVaultIdentityResourceId
          lifecycle: 'None'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'g1-readonly-verifier'
          image: verifierImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'g1-database-url'
            }
            {
              name: 'G1_MEMBER_A_SELECTOR'
              secretRef: 'g1-member-a-selector'
            }
            {
              name: 'G1_MEMBER_B_SELECTOR'
              secretRef: 'g1-member-b-selector'
            }
          ]
        }
      ]
    }
  }
}
