import { NodeLocatorService } from './node-locator.service';
import { ComponentMetaRegistry } from './component-metadata/component-meta.registry';
import { LOGIN_FORM_FIXTURE } from './__fixtures__/login-form.fixture';
import { LIST_PAGE_FIXTURE } from './__fixtures__/list-page.fixture';
import { DASHBOARD_PAGE_FIXTURE } from './__fixtures__/dashboard-page.fixture';

describe('NodeLocatorService', () => {
  let service: NodeLocatorService;

  beforeEach(() => {
    const registry = new ComponentMetaRegistry();
    service = new NodeLocatorService(registry);
  });

  it('returns exact mode for valid selectedId', () => {
    const result = service.locate(LOGIN_FORM_FIXTURE, 'btn_submit');
    expect(result.mode).toBe('exact');
    expect(result.targetId).toBe('btn_submit');
  });

  it('falls through when selectedId is invalid', () => {
    const result = service.locate(LOGIN_FORM_FIXTURE, 'nonexistent', '登录按钮');
    expect(result.mode).toBe('candidates');
    expect(result.candidates!.length).toBeGreaterThan(0);
  });

  it('matches "提交按钮" to Button via displayName', () => {
    const result = service.locate(LOGIN_FORM_FIXTURE, undefined, '提交按钮');
    expect(result.mode).toBe('candidates');
    const btnCandidate = result.candidates!.find((c) => c.id === 'btn_submit');
    expect(btnCandidate).toBeDefined();
  });

  it('matches "用户名输入框" to Input via prop text', () => {
    const result = service.locate(LOGIN_FORM_FIXTURE, undefined, '用户名');
    expect(result.mode).toBe('candidates');
    const hasInput = result.candidates!.some(
      (c) => c.id === 'input_username' || c.id === 'form_item_username',
    );
    expect(hasInput).toBe(true);
  });

  it('candidates are sorted by score descending', () => {
    const result = service.locate(LIST_PAGE_FIXTURE, undefined, '查询按钮');
    expect(result.mode).toBe('candidates');
    const scores = result.candidates!.map((c) => c.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it('filters out candidates with score < 0.1', () => {
    const result = service.locate(LOGIN_FORM_FIXTURE, undefined, '查询按钮');
    for (const c of result.candidates!) {
      expect(c.score).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('returns at most 5 candidates', () => {
    const result = service.locate(LIST_PAGE_FIXTURE, undefined, 'Button');
    expect(result.candidates!.length).toBeLessThanOrEqual(5);
  });

  it('returns empty candidates when no instruction', () => {
    const result = service.locate(LOGIN_FORM_FIXTURE);
    expect(result.mode).toBe('candidates');
    expect(result.candidates).toEqual([]);
  });

  it('finds dashboard action button by text on dashboard fixture', () => {
    const result = service.locate(DASHBOARD_PAGE_FIXTURE, undefined, '发布新商品按钮');
    expect(result.mode).toBe('candidates');
    expect(result.candidates?.[0]).toMatchObject({
      id: 'btn_publish',
      type: 'Button',
    });
    expect(result.candidates?.[0].reason).toBeTruthy();
  });
});
