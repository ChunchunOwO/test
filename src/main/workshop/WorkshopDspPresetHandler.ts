import type { EqBand, EqFilterType } from '../../shared/types/eq';
import {
  eqBandCount,
  eqFilterTypes,
  eqMaxFrequencyHz,
  eqMaxGainDb,
  eqMaxPreampDb,
  eqMaxQ,
  eqMinFrequencyHz,
  eqMinGainDb,
  eqMinPreampDb,
  eqMinQ,
} from '../../shared/types/eq';
import type { WorkshopDataContentHandler } from './WorkshopDataContentHandler';
import type { WorkshopDspPresetContribution } from './WorkshopDataContributionTypes';
import {
  asWorkshopDataRecord,
  assertWorkshopDataKeys,
  readWorkshopDataBoolean,
  readWorkshopDataHeader,
  readWorkshopDataNumber,
  readWorkshopDataString,
} from './WorkshopDataValidation';

const filterTypes = new Set<EqFilterType>(eqFilterTypes);

const normalizeBand = (value: unknown, index: number): EqBand => {
  const input = asWorkshopDataRecord(value, `workshop_data_dsp_band_${index}_invalid`);
  assertWorkshopDataKeys(
    input,
    ['frequencyHz', 'gainDb', 'q', 'filterType', 'enabled'],
    `workshop_data_dsp_band_${index}_unknown_field`,
  );
  const filterType = input.filterType === undefined
    ? 'peaking'
    : readWorkshopDataString(input.filterType, `dsp_band_${index}_filter_type`, 20);
  if (!filterTypes.has(filterType as EqFilterType)) {
    throw new Error(`workshop_data_dsp_band_${index}_filter_type_invalid`);
  }
  return {
    frequencyHz: readWorkshopDataNumber(
      input.frequencyHz,
      `dsp_band_${index}_frequency`,
      eqMinFrequencyHz,
      eqMaxFrequencyHz,
    ),
    gainDb: readWorkshopDataNumber(
      input.gainDb,
      `dsp_band_${index}_gain`,
      eqMinGainDb,
      eqMaxGainDb,
    ),
    q: readWorkshopDataNumber(input.q, `dsp_band_${index}_q`, eqMinQ, eqMaxQ),
    filterType: filterType as EqFilterType,
    enabled: input.enabled === undefined
      ? true
      : readWorkshopDataBoolean(input.enabled, `dsp_band_${index}_enabled`),
  };
};

export class WorkshopDspPresetHandler implements WorkshopDataContentHandler<'dsp-preset'> {
  readonly kind = 'dsp-preset' as const;

  normalize(inputValue: unknown, expectedContentId: string): WorkshopDspPresetContribution {
    const input = asWorkshopDataRecord(inputValue);
    assertWorkshopDataKeys(input, [
      'type',
      'schemaVersion',
      'id',
      'title',
      'description',
      'preampDb',
      'bands',
    ]);
    const header = readWorkshopDataHeader(
      input,
      'echo-workshop-dsp-preset',
      expectedContentId,
    );
    if (!Array.isArray(input.bands) || input.bands.length !== eqBandCount) {
      throw new Error('workshop_data_dsp_bands_invalid');
    }
    return {
      type: 'echo-workshop-dsp-preset',
      schemaVersion: 1,
      ...header,
      preampDb: readWorkshopDataNumber(
        input.preampDb,
        'dsp_preamp',
        eqMinPreampDb,
        eqMaxPreampDb,
      ),
      bands: input.bands.map(normalizeBand),
    };
  }
}
