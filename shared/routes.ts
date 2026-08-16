import { z } from 'zod';
import { insertBillSchema, insertPaymentSchema, insertCategoryBudgetSchema, bills, payments, categoryBudgets } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  bills: {
    list: {
      method: 'GET' as const,
      path: '/api/bills',
      responses: {
        200: z.array(z.custom<typeof bills.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/bills',
      input: insertBillSchema,
      responses: {
        201: z.custom<typeof bills.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/bills/:id',
      input: insertBillSchema.partial(),
      responses: {
        200: z.custom<typeof bills.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/bills/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  payments: {
    list: {
      method: 'GET' as const,
      path: '/api/payments',
      responses: {
        200: z.array(z.custom<typeof payments.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/payments',
      input: insertPaymentSchema,
      responses: {
        201: z.custom<typeof payments.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/payments/:id',
      input: insertPaymentSchema.partial(),
      responses: {
        200: z.custom<typeof payments.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/payments/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  budgets: {
    list: {
      method: 'GET' as const,
      path: '/api/budgets',
      responses: {
        200: z.array(z.custom<typeof categoryBudgets.$inferSelect>()),
      },
    },
    upsert: {
      method: 'POST' as const,
      path: '/api/budgets',
      input: insertCategoryBudgetSchema,
      responses: {
        201: z.custom<typeof categoryBudgets.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/budgets/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
