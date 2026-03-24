import { ContextAssemblerService } from './context-assembler.service';
import { SchemaResolverService } from './schema-resolver.service';
import { NodeLocatorService } from './node-locator.service';
import { SchemaSlicerService } from './schema-slicer.service';
import { ComponentMetaRegistry } from './component-metadata/component-meta.registry';
import { LOGIN_FORM_FIXTURE } from './__fixtures__/login-form.fixture';
import { DASHBOARD_PAGE_FIXTURE } from './__fixtures__/dashboard-page.fixture';

describe('ContextAssemblerService', () => {
  let service: ContextAssemblerService;
  let mockResolver: jest.Mocked<Pick<SchemaResolverService, 'resolve'>>;

  beforeEach(() => {
    mockResolver = {
      resolve: jest.fn().mockResolvedValue(LOGIN_FORM_FIXTURE),
    };
    const registry = new ComponentMetaRegistry();
    const locator = new NodeLocatorService(registry);
    const slicer = new SchemaSlicerService();

    service = new ContextAssemblerService(mockResolver as any, locator, slicer, registry);
  });

  it('returns focused mode with selectedId', async () => {
    const result = await service.assemble({
      pageId: 'page1',
      selectedId: 'btn_submit',
    });
    expect(result.mode).toBe('focused');
    expect(result.context).toBeDefined();
    expect(result.context!.focusNode.id).toBe('btn_submit');
  });

  it('returns candidates mode without selectedId', async () => {
    const result = await service.assemble({
      pageId: 'page1',
      instruction: '登录按钮',
    });
    expect(result.mode).toBe('candidates');
    expect(result.candidates!.length).toBeGreaterThan(0);
  });

  it('componentList is non-empty', async () => {
    const result = await service.assemble({
      pageId: 'page1',
      selectedId: 'btn_submit',
    });
    expect(result.componentList.length).toBeGreaterThanOrEqual(48);
  });

  it('passes sliceOptions through', async () => {
    const result = await service.assemble({
      pageId: 'page1',
      selectedId: 'btn_submit',
      sliceOptions: { maxSubtreeDepth: 1 },
    });
    expect(result.mode).toBe('focused');
    expect(result.context).toBeDefined();
  });

  it('assembles focused dashboard context for dashboard fixture', async () => {
    mockResolver.resolve.mockResolvedValueOnce(DASHBOARD_PAGE_FIXTURE);
    const result = await service.assemble({
      pageId: 'dashboard-page',
      selectedId: 'table_activity',
    });
    expect(result.mode).toBe('focused');
    expect(result.context?.focusNode.id).toBe('table_activity');
    expect(result.context?.parent?.id).toBe('card_activity');
  });
});
