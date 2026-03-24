import { NotFoundException } from '@nestjs/common';
import { SchemaSlicerService } from './schema-slicer.service';
import { LOGIN_FORM_FIXTURE } from './__fixtures__/login-form.fixture';
import { LARGE_PAGE_FIXTURE } from './__fixtures__/large-page.fixture';
import { DASHBOARD_PAGE_FIXTURE } from './__fixtures__/dashboard-page.fixture';

describe('SchemaSlicerService', () => {
  let service: SchemaSlicerService;

  beforeEach(() => {
    service = new SchemaSlicerService();
  });

  it('selected Button gets parent=FormItem', () => {
    const ctx = service.slice(LOGIN_FORM_FIXTURE, 'btn_submit');
    expect(ctx.focusNode.id).toBe('btn_submit');
    expect(ctx.focusNode.type).toBe('Button');
    expect(ctx.parent?.type).toBe('FormItem');
    expect(ctx.parent?.id).toBe('form_item_submit');
  });

  it('ancestors chain is correct', () => {
    const ctx = service.slice(LOGIN_FORM_FIXTURE, 'btn_submit');
    const types = ctx.ancestors.map((a) => a.type);
    expect(types).toEqual(['Page', 'Container', 'Form', 'FormItem']);
  });

  it('siblings are correct', () => {
    const ctx = service.slice(LOGIN_FORM_FIXTURE, 'form_item_username');
    const sibIds = ctx.siblings.map((s) => s.id);
    expect(sibIds).toContain('form_item_password');
    expect(sibIds).toContain('form_item_submit');
    expect(sibIds).not.toContain('form_item_username');
  });

  it('children are correct for container', () => {
    const ctx = service.slice(LOGIN_FORM_FIXTURE, 'form_main');
    const childIds = ctx.children.map((c) => c.id);
    expect(childIds).toContain('form_item_username');
    expect(childIds).toContain('form_item_password');
    expect(childIds).toContain('form_item_submit');
  });

  it('root node has parent=null', () => {
    const ctx = service.slice(LOGIN_FORM_FIXTURE, 'page_root');
    expect(ctx.parent).toBeNull();
    expect(ctx.ancestors).toHaveLength(0);
  });

  it('throws NotFoundException for missing targetId', () => {
    expect(() => service.slice(LOGIN_FORM_FIXTURE, 'nonexistent')).toThrow(NotFoundException);
  });

  it('schemaStats are correct', () => {
    const ctx = service.slice(LOGIN_FORM_FIXTURE, 'btn_submit');
    expect(ctx.schemaStats.totalComponents).toBe(Object.keys(LOGIN_FORM_FIXTURE.components).length);
    expect(ctx.schemaStats.rootId).toBe('page_root');
    expect(ctx.schemaStats.maxDepth).toBe(4);
  });

  it('large page budget trimming keeps output under maxOutputBytes', () => {
    const ctx = service.slice(LARGE_PAGE_FIXTURE, 'input_0_0', {
      maxOutputBytes: 8192,
    });
    const size = JSON.stringify(ctx).length;
    expect(size).toBeLessThanOrEqual(8192);
    expect(ctx.focusNode.id).toBe('input_0_0');
  });

  it('hard budget fallback still caps oversized focus props and many children', () => {
    const childrenIds = Array.from({ length: 200 }, (_, index) => `child_${index}`);
    const components = childrenIds.reduce(
      (acc, childId, index) => {
        acc[childId] = {
          id: childId,
          type: 'Text',
          props: { children: `说明 ${index}` },
        };
        return acc;
      },
      {
        page_root: {
          id: 'page_root',
          type: 'Page',
          childrenIds: ['target_container'],
        },
        target_container: {
          id: 'target_container',
          type: 'Container',
          childrenIds,
          props: {
            description: 'x'.repeat(10000),
          },
        },
      } as Record<string, any>,
    );

    const ctx = service.slice(
      {
        rootId: 'page_root',
        components,
      },
      'target_container',
      {
        maxOutputBytes: 8192,
      },
    );

    expect(JSON.stringify(ctx).length).toBeLessThanOrEqual(8192);
    expect(ctx.focusNode.id).toBe('target_container');
  });

  it('dashboard quick action button keeps the expected parent and ancestors', () => {
    const ctx = service.slice(DASHBOARD_PAGE_FIXTURE, 'btn_publish');
    expect(ctx.focusNode.type).toBe('Button');
    expect(ctx.parent?.id).toBe('space_actions');
    expect(ctx.ancestors.map((node) => node.id)).toEqual([
      'page_dashboard',
      'content_row',
      'col_actions',
      'card_actions',
      'space_actions',
    ]);
  });
});
