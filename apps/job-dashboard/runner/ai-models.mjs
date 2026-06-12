const cliProxyRoot = 'http://127.0.0.1:8317';

const anthropicGatewayModels = {
  'claude-opus-4-7': 'SubscriptionGateway/claude-opus-4-7',
  'claude-sonnet-4-6': 'SubscriptionGateway/claude-sonnet-4-6',
  'claude-opus-4-6': 'SubscriptionGateway/claude-opus-4-6',
  'claude-sonnet-4-5': 'claude-sonnet-4-5',
  'claude-haiku-4-5': 'SubscriptionGateway/claude-haiku-4-5-20251001',
  'claude-haiku-4-5-20251001': 'SubscriptionGateway/claude-haiku-4-5-20251001',
  'claude-opus-4-5': 'claude-opus-4-5',
};

const openAiModels = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5-pro',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o4-mini',
  'o3',
];

const anthropicModels = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5',
];

export function listConfiguredAiModels() {
  return [
    ...openAiModels.map(id => modelRow({
      provider: 'openai',
      id,
      gatewayModel: id,
      label: `OpenAI ${id}`,
      recommended: id === 'gpt-5.4-mini',
    })),
    ...anthropicModels.map(id => modelRow({
      provider: 'anthropic',
      id,
      gatewayModel: anthropicGatewayModels[id] || id,
      label: `Anthropic ${id}`,
      recommended: id === 'claude-haiku-4-5',
    })),
  ];
}

export function cheapModelTestPlan(root = cliProxyRoot) {
  return [
    normalizeSelectedAiModel({ provider: 'openai', model: 'gpt-5.4-mini', root }),
    normalizeSelectedAiModel({ provider: 'anthropic', model: 'claude-haiku-4-5', root }),
  ];
}

export function normalizeSelectedAiModel({ provider = 'openai', model = '', root = cliProxyRoot } = {}) {
  const normalizedProvider = String(provider || 'openai').trim().toLowerCase();
  const selected = String(model || '').trim();
  const baseUrl = providerBaseUrl(normalizedProvider, root);
  
  // If we are pointing at a direct V1 endpoint (generic/clawopen), 
  // we bypass the SubscriptionGateway/ mapping.
  const isDirectV1 = baseUrl.endsWith('/v1') && !baseUrl.includes('/api/provider/');

  let gatewayModel = selected;
  if (normalizedProvider === 'anthropic') {
    gatewayModel = anthropicGatewayModels[selected] || selected || anthropicGatewayModels['claude-haiku-4-5'];
  } else if (!selected) {
    gatewayModel = 'gpt-5.4-mini';
  }

  if (isDirectV1 && gatewayModel.startsWith('SubscriptionGateway/')) {
    gatewayModel = gatewayModel.replace(/^SubscriptionGateway\//, '');
  }

  return {
    provider: normalizedProvider,
    model: gatewayModel,
    requestedModel: selected || gatewayModel,
    baseUrl,
  };
}

export function providerBaseUrl(provider, root = cliProxyRoot) {
  const normalizedRoot = String(root || cliProxyRoot).replace(/\/$/, '');
  
  // If the root already ends in /v1, it's a direct provider endpoint or a generic proxy (clawopen)
  if (normalizedRoot.endsWith('/v1')) {
    return normalizedRoot;
  }

  // Otherwise fallback to the CLIProxyAPI multi-provider path
  return `${normalizedRoot}/api/provider/${provider === 'anthropic' ? 'anthropic' : 'openai'}/v1`;
}

export function parseGatewayModelIds(payload = {}) {
  return (payload.data || payload.models || [])
    .map(item => String(item.id || item.name || '').trim())
    .filter(Boolean);
}

export function annotateModelAvailability(models = listConfiguredAiModels(), gatewayIds = []) {
  const available = new Set(gatewayIds);
  return models.map(model => ({
    ...model,
    available: available.has(model.id) || available.has(model.gatewayModel),
  }));
}

function modelRow({ provider, id, gatewayModel, label, recommended }) {
  return {
    provider,
    id,
    gatewayModel,
    label,
    recommended,
  };
}
