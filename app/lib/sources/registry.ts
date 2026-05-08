import type { DataSourceProvider } from './types'

const valuesSources = new Map<string, DataSourceProvider>()

export function registerValueSource(provider: DataSourceProvider): void {
  if (provider.type !== 'values') {
    throw new Error(`Cannot register non-values provider "${provider.id}" as a value source`)
  }
  valuesSources.set(provider.id, provider)
}

export function getValueSource(id: string): DataSourceProvider | undefined {
  return valuesSources.get(id)
}

export function getAllValueSources(): DataSourceProvider[] {
  return Array.from(valuesSources.values())
}

export function getValueSourceIds(): string[] {
  return Array.from(valuesSources.keys())
}
