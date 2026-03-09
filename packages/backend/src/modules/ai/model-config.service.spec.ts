import { Test, TestingModule } from '@nestjs/testing';
import { ModelConfigService, AIModelConfigEntity } from './model-config.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');

describe('ModelConfigService', () => {
  let service: ModelConfigService;
  const mockConfigFilePath = path.resolve(process.cwd(), 'ai-models.json');

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ModelConfigService],
    }).compile();

    service = module.get<ModelConfigService>(ModelConfigService);
  });

  describe('onModuleInit', () => {
    it('should load models from file if it exists', () => {
      const mockData: AIModelConfigEntity[] = [
        {
          id: '1',
          name: 'Test Model',
          provider: 'openai',
          model: 'gpt-3.5',
          baseURL: '',
          temperature: 0.7,
          maxTokens: 1000,
          createdAt: 123,
          updatedAt: 123,
        },
      ];
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockData));

      service.onModuleInit();

      expect(fs.existsSync).toHaveBeenCalledWith(mockConfigFilePath);
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigFilePath, 'utf-8');
      expect(service.getAllModels()).toHaveLength(1);
      expect(service.getModel('1')).toEqual(mockData[0]);
    });

    it('should create empty file if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      service.onModuleInit();

      expect(fs.existsSync).toHaveBeenCalledWith(mockConfigFilePath);
      expect(fs.writeFileSync).toHaveBeenCalledWith(mockConfigFilePath, '[]', 'utf-8');
      expect(service.getAllModels()).toHaveLength(0);
    });

    it('should handle JSON parse errors gracefully', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

      service.onModuleInit();

      // Should not throw and models should be empty
      expect(service.getAllModels()).toHaveLength(0);
    });
  });

  describe('CRUD operations', () => {
    beforeEach(() => {
      // Initialize with an empty state for CRUD tests
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      service.onModuleInit();
    });

    it('should save a new model', () => {
      const newConfig = {
        id: 'test-1',
        name: 'GPT 4',
        provider: 'openai',
        model: 'gpt-4',
        baseURL: '',
        temperature: 0.5,
        maxTokens: 2000,
      };

      const result = service.saveModel(newConfig);

      expect(result.id).toBe('test-1');
      expect(result.name).toBe('GPT 4');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      expect(service.getModel('test-1')).toEqual(result);
      expect(fs.writeFileSync).toHaveBeenCalled(); // Should trigger save to file
    });

    it('should update an existing model', () => {
      const initialConfig = {
        id: 'test-2',
        name: 'Old Name',
        provider: 'openai',
        model: 'gpt-3.5',
        baseURL: '',
        temperature: 0.5,
        maxTokens: 2000,
      };
      service.saveModel(initialConfig);

      const createdAt = service.getModel('test-2')!.createdAt;

      // Update the model
      const updatedConfig = { id: 'test-2', name: 'New Name' };
      const result = service.saveModel(updatedConfig);

      expect(result.name).toBe('New Name');
      expect(result.createdAt).toBe(createdAt); // CreatedAt should remain the same

      const allModels = service.getAllModels();
      expect(allModels).toHaveLength(1);
    });

    it('should handle isDefault logic', () => {
      service.saveModel({
        id: 'm1',
        name: 'Model 1',
        provider: 'openai',
        model: 'model-1',
        baseURL: '',
        temperature: 0.5,
        maxTokens: 2000,
        isDefault: true,
      });
      service.saveModel({
        id: 'm2',
        name: 'Model 2',
        provider: 'openai',
        model: 'model-2',
        baseURL: '',
        temperature: 0.5,
        maxTokens: 2000,
      });

      expect(service.getModel('m1')!.isDefault).toBe(true);
      expect(service.getModel('m2')!.isDefault).toBeFalsy();

      // Setting m2 as default should unset m1
      service.saveModel({ id: 'm2', isDefault: true });

      expect(service.getModel('m1')!.isDefault).toBe(false);
      expect(service.getModel('m2')!.isDefault).toBe(true);
    });

    it('should delete a model', () => {
      service.saveModel({
        id: 'to-delete',
        name: 'Delete Me',
        provider: 'openai',
        model: 'model',
        baseURL: '',
        temperature: 0.5,
        maxTokens: 2000,
      });
      expect(service.getAllModels()).toHaveLength(1);

      const result = service.deleteModel('to-delete');

      expect(result).toBe(true);
      expect(service.getAllModels()).toHaveLength(0);
      expect(fs.writeFileSync).toHaveBeenCalled(); // Should trigger save after delete
    });

    it('should return false when deleting non-existent model', () => {
      const result = service.deleteModel('non-existent');
      expect(result).toBe(false);
    });
  });
});
