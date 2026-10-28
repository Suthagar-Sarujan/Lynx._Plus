import type { TemplateRenderer, RenderTemplateInput } from '@/application/services/TemplateRenderer';

/** Renders the template for unsaved edits so the dashboard can show a live preview. */
export class PreviewTemplate {
  constructor(private readonly renderer: TemplateRenderer) {}

  execute(input: RenderTemplateInput): Promise<Buffer> {
    return this.renderer.renderToBuffer(input);
  }
}
