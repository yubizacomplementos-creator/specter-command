import { AttributeType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";

export const attributeSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  type: z.nativeEnum(AttributeType),
  required: z.boolean().default(false),
  searchable: z.boolean().default(false),
  settings: z.record(z.unknown()).default({})
});

export const entitySchema = z.object({
  companyId: z.string(),
  moduleKey: z.string().min(2),
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  attributes: z.array(attributeSchema).default([])
});

export async function createConfigurableEntity(input: z.infer<typeof entitySchema>) {
  const parsed = entitySchema.parse(input);
  const attributes = parsed.attributes.map((attribute) => ({
    ...attribute,
    settings: attribute.settings as Prisma.InputJsonObject
  }));

  return prisma.configEntity.create({
    data: {
      companyId: parsed.companyId,
      moduleKey: parsed.moduleKey,
      key: parsed.key,
      name: parsed.name,
      description: parsed.description,
      schema: {
        version: 1,
        configurable: true
      },
      attributes: {
        create: attributes
      }
    },
    include: {
      attributes: true
    }
  });
}
