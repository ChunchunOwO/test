import type { WorkshopDataContentHandler } from './WorkshopDataContentHandler';
import type {
  WorkshopAudioPluginParameterContribution,
  WorkshopAudioPluginPresetContribution,
  WorkshopAudioPluginProfileContribution,
} from './WorkshopDataContributionTypes';
import {
  asWorkshopDataRecord,
  assertWorkshopDataKeys,
  readWorkshopDataHeader,
  readWorkshopDataNumber,
  readWorkshopDataString,
} from './WorkshopDataValidation';

const vst3ClassIdPattern = /^[a-f0-9]{32}$/u;
const parameterIdMaximum = 0xffff_ffff;

const normalizeParameter = (
  value: unknown,
  index: number,
): WorkshopAudioPluginParameterContribution => {
  const input = asWorkshopDataRecord(value, 'workshop_data_audio_plugin_parameter_invalid');
  assertWorkshopDataKeys(
    input,
    ['id', 'title', 'kind', 'defaultValue', 'choices'],
    'workshop_data_audio_plugin_parameter_unknown_field',
  );
  const id = readWorkshopDataNumber(input.id, `audio_plugin_parameter_${index}_id`, 0, parameterIdMaximum, {
    integer: true,
  });
  const title = readWorkshopDataString(input.title, `audio_plugin_parameter_${index}_title`, 80);
  const kind = readWorkshopDataString(input.kind, `audio_plugin_parameter_${index}_kind`, 16);
  if (kind !== 'continuous' && kind !== 'toggle' && kind !== 'choice') {
    throw new Error('workshop_data_audio_plugin_parameter_kind_invalid');
  }
  const defaultValue = readWorkshopDataNumber(
    input.defaultValue,
    `audio_plugin_parameter_${index}_default`,
    0,
    1,
  );
  let choices: string[] | undefined;
  if (kind === 'choice') {
    if (!Array.isArray(input.choices) || input.choices.length < 2 || input.choices.length > 128) {
      throw new Error('workshop_data_audio_plugin_parameter_choices_invalid');
    }
    choices = input.choices.map((choice, choiceIndex) =>
      readWorkshopDataString(choice, `audio_plugin_parameter_${index}_choice_${choiceIndex}`, 80));
    if (new Set(choices).size !== choices.length) {
      throw new Error('workshop_data_audio_plugin_parameter_choices_duplicate');
    }
  } else if (input.choices !== undefined) {
    throw new Error('workshop_data_audio_plugin_parameter_choices_unexpected');
  }
  return { id, title, kind, defaultValue, ...(choices ? { choices } : {}) };
};

const normalizePreset = (
  value: unknown,
  index: number,
  parameterIds: ReadonlySet<number>,
): WorkshopAudioPluginPresetContribution => {
  const input = asWorkshopDataRecord(value, 'workshop_data_audio_plugin_preset_invalid');
  assertWorkshopDataKeys(
    input,
    ['id', 'title', 'values'],
    'workshop_data_audio_plugin_preset_unknown_field',
  );
  const id = readWorkshopDataString(input.id, `audio_plugin_preset_${index}_id`, 80).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,78}[a-z0-9])?$/u.test(id)) {
    throw new Error('workshop_data_audio_plugin_preset_id_invalid');
  }
  const title = readWorkshopDataString(input.title, `audio_plugin_preset_${index}_title`, 120);
  const valuesInput = asWorkshopDataRecord(input.values, 'workshop_data_audio_plugin_preset_values_invalid');
  if (Object.keys(valuesInput).length > parameterIds.size) {
    throw new Error('workshop_data_audio_plugin_preset_values_limit');
  }
  const values: Record<string, number> = {};
  for (const [parameterIdText, rawValue] of Object.entries(valuesInput)) {
    if (!/^\d{1,10}$/u.test(parameterIdText)) {
      throw new Error('workshop_data_audio_plugin_preset_parameter_id_invalid');
    }
    const parameterId = Number(parameterIdText);
    if (!Number.isSafeInteger(parameterId) || !parameterIds.has(parameterId)) {
      throw new Error('workshop_data_audio_plugin_preset_parameter_unknown');
    }
    values[String(parameterId)] = readWorkshopDataNumber(
      rawValue,
      `audio_plugin_preset_${index}_value_${parameterId}`,
      0,
      1,
    );
  }
  return { id, title, values };
};

export class WorkshopAudioPluginProfileHandler
implements WorkshopDataContentHandler<'audio-plugin-profile'> {
  readonly kind = 'audio-plugin-profile' as const;

  normalize(inputValue: unknown, expectedContentId: string): WorkshopAudioPluginProfileContribution {
    const input = asWorkshopDataRecord(inputValue);
    assertWorkshopDataKeys(input, [
      'type',
      'schemaVersion',
      'id',
      'title',
      'description',
      'format',
      'role',
      'plugin',
      'adapter',
      'routing',
      'parameters',
      'presets',
    ], 'workshop_data_audio_plugin_profile_unknown_field');
    const header = readWorkshopDataHeader(
      input,
      'echo-workshop-audio-plugin-profile',
      expectedContentId,
    );
    if (input.format !== 'vst3') {
      throw new Error('workshop_data_audio_plugin_format_invalid');
    }
    if (input.role !== 'effect' && input.role !== 'instrument') {
      throw new Error('workshop_data_audio_plugin_role_invalid');
    }

    const pluginInput = asWorkshopDataRecord(input.plugin, 'workshop_data_audio_plugin_identity_invalid');
    assertWorkshopDataKeys(pluginInput, ['classId', 'name', 'vendor'], 'workshop_data_audio_plugin_identity_unknown_field');
    const classId = readWorkshopDataString(pluginInput.classId, 'audio_plugin_class_id', 32).toLowerCase();
    if (!vst3ClassIdPattern.test(classId)) {
      throw new Error('workshop_data_audio_plugin_class_id_invalid');
    }

    const adapterInput = asWorkshopDataRecord(input.adapter, 'workshop_data_audio_plugin_adapter_invalid');
    assertWorkshopDataKeys(adapterInput, ['api', 'minimumVersion'], 'workshop_data_audio_plugin_adapter_unknown_field');
    if (adapterInput.api !== 'echo.audio-plugin-adapter') {
      throw new Error('workshop_data_audio_plugin_adapter_api_invalid');
    }
    const minimumVersion = readWorkshopDataNumber(
      adapterInput.minimumVersion,
      'audio_plugin_adapter_minimum_version',
      1,
      1_000,
      { integer: true },
    );

    const routingInput = asWorkshopDataRecord(input.routing, 'workshop_data_audio_plugin_routing_invalid');
    assertWorkshopDataKeys(routingInput, ['placement'], 'workshop_data_audio_plugin_routing_unknown_field');
    if (routingInput.placement !== 'pre-dsp' && routingInput.placement !== 'post-dsp') {
      throw new Error('workshop_data_audio_plugin_routing_placement_invalid');
    }

    if (!Array.isArray(input.parameters) || input.parameters.length > 256) {
      throw new Error('workshop_data_audio_plugin_parameters_invalid');
    }
    const parameters = input.parameters.map(normalizeParameter);
    const parameterIds = new Set(parameters.map((parameter) => parameter.id));
    if (parameterIds.size !== parameters.length) {
      throw new Error('workshop_data_audio_plugin_parameter_duplicate');
    }
    if (!Array.isArray(input.presets) || input.presets.length > 64) {
      throw new Error('workshop_data_audio_plugin_presets_invalid');
    }
    const presets = input.presets.map((preset, index) => normalizePreset(preset, index, parameterIds));
    if (new Set(presets.map((preset) => preset.id)).size !== presets.length) {
      throw new Error('workshop_data_audio_plugin_preset_duplicate');
    }

    return {
      type: 'echo-workshop-audio-plugin-profile',
      schemaVersion: 1,
      id: header.id,
      title: header.title,
      ...(header.description ? { description: header.description } : {}),
      format: 'vst3',
      role: input.role,
      plugin: {
        classId,
        name: readWorkshopDataString(pluginInput.name, 'audio_plugin_name', 120),
        vendor: readWorkshopDataString(pluginInput.vendor, 'audio_plugin_vendor', 120),
      },
      adapter: {
        api: 'echo.audio-plugin-adapter',
        minimumVersion,
      },
      routing: { placement: routingInput.placement },
      parameters,
      presets,
    };
  }
}
