# BillFlow - Personal Bill Management Application

## Overview

BillFlow is a personal finance application for tracking and managing recurring bills and payments. Users can add bills with customizable frequencies (monthly/yearly), mark payments as complete, and view payment history. The application provides a dashboard with statistics showing total budget, paid amounts, and overdue bills.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens (CSS variables for theming)
- **Animations**: Framer Motion for page transitions and interactions
- **Charts**: Recharts for data visualization
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for type-safe request/response validation
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Build System**: Vite for frontend bundling, esbuild for server bundling

### Data Storage
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` using Drizzle's pgTable definitions
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization

### Key Data Models
1. **Bills**: Recurring payment obligations with name, category, amount, frequency (monthly/yearly), and due date configuration
2. **Payments**: Individual payment records linked to bills with status tracking (paid/pending/overdue)

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/   # UI components including shadcn/ui
│       ├── hooks/        # Custom React hooks for data fetching
│       ├── pages/        # Route page components
│       └── lib/          # Utilities and query client setup
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route handlers
│   ├── storage.ts    # Database access layer
│   └── db.ts         # Database connection setup
├── shared/           # Shared code between client/server
│   ├── schema.ts     # Drizzle database schema and Zod types
│   └── routes.ts     # API route definitions with validation
└── migrations/       # Database migration files
```

### Development vs Production
- **Development**: Vite dev server with HMR, integrated with Express backend
- **Production**: Static files served from `dist/public`, server bundled to `dist/index.cjs`

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage for PostgreSQL (available but not currently implemented)

### UI Component Libraries
- **Radix UI**: Headless component primitives (dialogs, dropdowns, forms, etc.)
- **shadcn/ui**: Pre-styled component library using Radix + Tailwind

### Data Validation
- **Zod**: Schema validation for API requests/responses
- **drizzle-zod**: Generates Zod schemas from Drizzle table definitions

### Date Handling
- **date-fns**: Date manipulation and formatting throughout the application

### Build Tools
- **Vite**: Frontend development server and bundler
- **esbuild**: Server-side bundling for production
- **TypeScript**: Type checking across the entire codebase