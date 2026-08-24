import type { WorkshopDataContentHandler } from './WorkshopDataContentHandler';
import type {
  WorkshopVisualizerPresetContribution,
  WorkshopVisualizerStyle,
} from './WorkshopDataContributionTypes';
import {
  asWorkshopDataRecord,
  assertWorkshopDataKeys,
  readWorkshopDataBoolean,
  readWorkshopDataHeader,
  readWorkshopDataHexColor,
  readWorkshopDataNumber,
  readWorkshopDataString,
} from './WorkshopDataValidation';

const visualizerStyles = new Set<WorkshopVisualizerStyle>(['bars', 'wave', 'radial']);

export class WorkshopVisualizerPresetHandler
implements WorkshopDataContentHandler<'visualizer-preset'> {
  readonly kind = 'visualizer-preset' as const;

  normalize(
    inputValue: unknown,
    expectedContentId: string,
  ): WorkshopVisualizerPresetContribution {
    const input = asWorkshopDataRecord(inputValue);
    assertWorkshopDataKeys(input, [
      'type',
      'schemaVersion',
      'id',
      'title',
      'description',
      'style',
      'palette',
      'barCount',
      'smoothing',
      'sensitivity',
      'decay',
      'mirror',
    ]);
    const header = readWorkshopDataHeader(
      input,
      'echo-workshop-visualizer-preset',
      expectedContentId,
    );
    const style = readWorkshopDataString(input.style, 'visualizer_style', 16);
    if (!visualizerStyles.has(style as WorkshopVisualizerStyle)) {
      throw new Error('workshop_data_visualizer_style_invalid');
    }
    if (!Array.isArray(input.palette) || input.palette.length < 1 || input.palette.length > 8) {
      throw new Error('workshop_data_visualizer_palette_invalid');
    }
    const palette = input.palette.map((value, index) =>
      readWorkshopDataHexColor(value, `visualizer_palette_${index}`));
    if (new Set(palette).size !== palette.length) {
      throw new Error('workshop_data_visualizer_palette_duplicate');
    }

    return {
      type: 'echo-workshop-visualizer-preset',
      schemaVersion: 1,
      ...header,
      style: style as WorkshopVisualizerStyle,
      palette,
      barCount: readWorkshopDataNumber(input.barCount, 'visualizer_bar_count', 8, 128, {
        integer: true,
      }),
      smoothing: readWorkshopDataNumber(input.smoothing, 'visualizer_smoothing', 0, 1),
      sensitivity: readWorkshopDataNumber(input.sensitivity, 'visualizer_sensitivity', 0.25, 4),
      decay: readWorkshopDataNumber(input.decay, 'visualizer_decay', 0, 1),
      mirror: readWorkshopDataBoolean(input.mirror, 'visualizer_mirror'),
    };
  }
}
