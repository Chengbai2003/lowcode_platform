import { describe, it, expect } from 'vitest';
import { compileStyle } from '../src/styleCompiler';

describe('styleCompiler', () => {
    it('should handle undefined style', () => {
        expect(compileStyle(undefined)).toEqual({ className: '', styleObj: {} });
    });

    it('should map static styles to tailwind classes', () => {
        const { className, styleObj } = compileStyle({
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            position: 'absolute'
        });

        expect(className).toContain('flex');
        expect(className).toContain('flex-row');
        expect(className).toContain('justify-center');
        expect(className).toContain('absolute');
        expect(styleObj).toEqual({});
    });

    it('should map prefix styles to dynamic tailwind classes', () => {
        const { className, styleObj } = compileStyle({
            padding: '20px',
            margin: '10px',
            width: '100%',
            height: 'auto'
        });

        expect(className).toContain('p-[20px]');
        expect(className).toContain('m-[10px]');
        expect(className).toContain('w-full'); // special value
        expect(className).toContain('h-auto'); // special value
        expect(styleObj).toEqual({});
    });

    it('should keep complex values in inline styleObj', () => {
        const { className, styleObj } = compileStyle({
            width: 'calc(100% - 20px)',
            color: 'var(--primary-color)',
            backgroundImage: 'url("test.png")'
        });

        expect(className).toBe('');
        expect(styleObj).toEqual({
            width: 'calc(100% - 20px)',
            color: 'var(--primary-color)',
            backgroundImage: 'url("test.png")'
        });
    });

    it('should handle shorthand properties (naive space replacement)', () => {
        const { className, styleObj } = compileStyle({
            margin: '10px 20px'
        });

        expect(className).toBe('m-[10px_20px]');
        expect(styleObj).toEqual({});
    });

    it('should keep unmapped properties in styleObj', () => {
        const { className, styleObj } = compileStyle({
            customProp: 'test',
            transform: 'scale(1.5)' // transform is not in prefix map or static map
        });

        expect(className).toBe('');
        expect(styleObj).toEqual({
            customProp: 'test',
            transform: 'scale(1.5)'
        });
    });
});
