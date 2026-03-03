const { z } = require('zod');
const catalog = require('../../../../data/catalog');

function normalizeIngredientId(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

const MAX_INGREDIENTS = 10;
const MAX_QUANTITY = 10;

const VALID_INGREDIENTS = new Set(
  (Array.isArray(catalog.menu) ? catalog.menu : [])
    .flatMap((item) => [
      ...(Array.isArray(item?.ingredients) ? item.ingredients : []),
      ...(Array.isArray(item?.ingredienti) ? item.ingredienti : [])
    ])
    .map(normalizeIngredientId)
    .filter(Boolean)
);

const IngredientIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    if (!VALID_INGREDIENTS.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invalid_ingredient'
      });
    }
  });

const IngredientArraySchema = z.array(IngredientIdSchema).max(MAX_INGREDIENTS).default([]);
const QuantitySchema = z.coerce.number().int().min(1).max(MAX_QUANTITY).default(1);

const AddItemSchema = z
  .object({
    itemId: z.string().trim().min(1),
    quantity: QuantitySchema,
    extraIngredients: IngredientArraySchema,
    removedIngredients: IngredientArraySchema
  })
  .strict();

const RemoveItemSchema = z
  .object({
    itemId: z.string().trim().min(1),
    quantity: QuantitySchema
  })
  .strict();

const CreateCustomItemSchema = z
  .object({
    baseItemId: z.string().trim().min(1),
    quantity: QuantitySchema,
    extraIngredients: IngredientArraySchema,
    removedIngredients: IngredientArraySchema
  })
  .strict();

const SuggestItemsSchema = z
  .object({
    tags: z.array(z.string().trim().toLowerCase()).max(5).default([]),
    limit: z.coerce.number().int().min(1).max(5).default(3)
  })
  .strict();

const TOOL_PARAMETERS = {
  add: {
    type: 'object',
    additionalProperties: false,
    properties: {
      itemId: { type: 'string', description: 'ID articolo da catalogo' },
      quantity: { type: 'integer', minimum: 1, maximum: MAX_QUANTITY, default: 1 },
      extraIngredients: {
        type: 'array',
        items: { type: 'string', enum: Array.from(VALID_INGREDIENTS) },
        default: []
      },
      removedIngredients: {
        type: 'array',
        items: { type: 'string', enum: Array.from(VALID_INGREDIENTS) },
        default: []
      }
    },
    required: ['itemId']
  },
  remove: {
    type: 'object',
    additionalProperties: false,
    properties: {
      itemId: { type: 'string', description: 'ID articolo da catalogo' },
      quantity: { type: 'integer', minimum: 1, maximum: MAX_QUANTITY, default: 1 }
    },
    required: ['itemId']
  },
  custom: {
    type: 'object',
    additionalProperties: false,
    properties: {
      baseItemId: { type: 'string', description: 'ID articolo base da catalogo' },
      quantity: { type: 'integer', minimum: 1, maximum: MAX_QUANTITY, default: 1 },
      extraIngredients: {
        type: 'array',
        items: { type: 'string', enum: Array.from(VALID_INGREDIENTS) },
        default: []
      },
      removedIngredients: {
        type: 'array',
        items: { type: 'string', enum: Array.from(VALID_INGREDIENTS) },
        default: []
      }
    },
    required: ['baseItemId']
  },
  suggest: {
    type: 'object',
    additionalProperties: false,
    properties: {
      tags: { type: 'array', items: { type: 'string' }, default: [] },
      limit: { type: 'integer', minimum: 1, maximum: 5, default: 3 }
    },
    required: []
  }
};

function toToolParameters(schemaName) {
  return TOOL_PARAMETERS[schemaName];
}

function parseWith(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { ok: false, error: 'INVALID_TOOL_PAYLOAD' };
  }
  return { ok: true, data: result.data };
}

module.exports = {
  AddItemSchema,
  RemoveItemSchema,
  CreateCustomItemSchema,
  SuggestItemsSchema,
  IngredientIdSchema,
  QuantitySchema,
  VALID_INGREDIENTS,
  parseWith,
  toToolParameters,
  MAX_INGREDIENTS,
  MAX_QUANTITY,
  normalizeIngredientId
};
