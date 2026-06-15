<div align="center">

<h1>💳 ReconAI — Payment Reconciliation System</h1>

<p>
  An intelligent, full-stack payment reconciliation platform built with TypeScript.<br/>
  Automate discrepancy detection, streamline financial audits, and bring clarity to your payment data.
</p>

[![TypeScript](https://img.shields.io/badge/TypeScript-96.9%25-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Monorepo-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Repository Structure](#-repository-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running the App](#running-the-app)
- [Available Scripts](#-available-scripts)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🔍 Overview

**ReconAI** is a full-stack payment reconciliation system designed to automatically match, verify, and flag payment records across data sources. It helps finance teams identify discrepancies, reduce manual effort, and maintain audit-ready records with minimal friction.

The application is structured as an **npm workspace monorepo**, with a dedicated backend API and a modern frontend dashboard.

---

## ✨ Features

- 🔄 **Automated Reconciliation** — Match payment records across multiple sources automatically
- 🚨 **Discrepancy Detection** — Instantly flag mismatches, duplicates, or missing entries
- 📊 **Dashboard & Reporting** — Visualize reconciliation status and trends at a glance
- 🗄️ **Database Migrations** — Versioned schema management for safe, repeatable deployments
- 🌱 **Data Seeding** — Built-in seed scripts for development and testing environments
- ⚡ **Concurrent Dev Server** — Run backend and frontend together with a single command
- 🔒 **Type-Safe End-to-End** — TypeScript throughout the entire stack

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Language** | TypeScript |
| **Monorepo** | npm Workspaces |
| **Backend** | Node.js (see `packages/backend`) |
| **Frontend** | TypeScript + CSS (see `packages/frontend`) |
| **Database** | Relational DB via migration system |
| **Dev Tooling** | `concurrently` for parallel dev servers |

> **Note:** Update this table with your specific frameworks (e.g., Express, Fastify, React, Next.js, Prisma, Drizzle, etc.) once finalized.

---

## 📁 Repository Structure

```
Payment-Reconciliation-System/
├── packages/
│   ├── backend/          # API server, database layer, business logic
│   │   ├── src/
│   │   ├── package.json
│   │   └── ...
│   └── frontend/         # UI dashboard and client-side logic
│       ├── src/
│       ├── package.json
│       └── ...
├── package.json          # Root workspace config & shared scripts
├── package-lock.json
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) **v18+**
- [npm](https://www.npmjs.com/) **v9+** *(comes with Node.js)*
- A compatible database (PostgreSQL / MySQL / SQLite — check `packages/backend` for config)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Probot-01/Payment-Reconciliation-System.git
cd Payment-Reconciliation-System

# 2. Install all dependencies (installs both backend & frontend via workspaces)
npm install
```

### Environment Variables

The backend requires environment variables to connect to the database and configure the app.

```bash
# Copy the example file and fill in your values
cp packages/backend/.env.example packages/backend/.env
```

Key variables to configure (update according to your setup):

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/reconai

# Server
PORT=4000
NODE_ENV=development
```

> Refer to `packages/backend/.env.example` for the full list of required variables.

### Database Setup

```bash
# Run migrations to create the database schema
npm run db:migrate

# (Optional) Seed the database with sample data
npm run db:seed
```

### Running the App

```bash
# Start both backend and frontend in development mode (recommended)
npm run dev

# Or run them individually:
npm run dev:backend    # Backend only
npm run dev:frontend   # Frontend only
```

Once running:

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 *(or configured port)* |
| **Backend API** | http://localhost:4000 *(or configured port)* |

---

## 📜 Available Scripts

All scripts are run from the **root** of the repository.

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend **and** frontend concurrently in watch mode |
| `npm run dev:backend` | Start only the backend development server |
| `npm run dev:frontend` | Start only the frontend development server |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run db:seed` | Seed the database with initial/test data |
| `npm run build` | Build the frontend for production |


