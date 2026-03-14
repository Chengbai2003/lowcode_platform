import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aiApi } from '../api/ai-api';
import type { AIModelConfig } from '../types/ai-types';

export const useAIModels = () => {
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('mock');
  const currentModelRef = useRef(currentModel);

  useEffect(() => {
    currentModelRef.current = currentModel;
  }, [currentModel]);

  const loadModels = useCallback(async () => {
    try {
      const allModels = await aiApi.getModels();
      setModels(allModels);

      const currentModelValue = currentModelRef.current;
      if (currentModelValue === 'mock') {
        const defaultModel =
          allModels.find((m: AIModelConfig) => m.isDefault && m.isAvailable) ||
          allModels.find((m: AIModelConfig) => m.isAvailable);
        if (defaultModel) {
          setCurrentModel(defaultModel.id);
        }
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      throw error;
    }
  }, []);

  const ensureModelsLoaded = useCallback(async () => {
    if (models.length === 0) {
      await loadModels();
    }
  }, [models.length, loadModels]);

  const currentModelName = useMemo(() => {
    const model = models.find((m) => m.id === currentModel);
    return model?.name || 'Unknown';
  }, [models, currentModel]);

  return {
    models,
    currentModel,
    setCurrentModel,
    loadModels,
    ensureModelsLoaded,
    currentModelName,
  };
};
