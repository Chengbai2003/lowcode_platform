import { A2UIComponent, A2UISchema } from '../types/schema.types';

function buildLargePageFixture(): A2UISchema {
  const components: Record<string, A2UIComponent> = {};
  const cardIds: string[] = [];

  for (let c = 0; c < 10; c++) {
    const cardId = `card_${c}`;
    const childIds: string[] = [];

    for (let i = 0; i < 8; i++) {
      const fiId = `fi_${c}_${i}`;
      const inputId = `input_${c}_${i}`;
      childIds.push(fiId);
      components[fiId] = {
        id: fiId,
        type: 'FormItem',
        childrenIds: [inputId],
        props: { label: `字段${c}-${i}`, name: `field_${c}_${i}` },
      };
      components[inputId] = {
        id: inputId,
        type: 'Input',
        props: { placeholder: `请输入字段${c}-${i}` },
      };
    }

    for (let i = 0; i < 2; i++) {
      const btnId = `btn_${c}_${i}`;
      childIds.push(btnId);
      components[btnId] = {
        id: btnId,
        type: 'Button',
        props: { children: `操作${c}-${i}`, type: i === 0 ? 'primary' : 'default' },
      };
    }

    for (let i = 0; i < 2; i++) {
      const textId = `text_${c}_${i}`;
      childIds.push(textId);
      components[textId] = { id: textId, type: 'Text', props: { children: `说明文本${c}-${i}` } };
    }

    cardIds.push(cardId);
    components[cardId] = {
      id: cardId,
      type: 'Card',
      childrenIds: childIds,
      props: { title: `卡片${c}` },
    };
  }

  components['page_root'] = { id: 'page_root', type: 'Page', childrenIds: ['container_main'] };
  components['container_main'] = { id: 'container_main', type: 'Container', childrenIds: cardIds };

  return { version: 1, rootId: 'page_root', components };
}

export const LARGE_PAGE_FIXTURE: A2UISchema = buildLargePageFixture();
