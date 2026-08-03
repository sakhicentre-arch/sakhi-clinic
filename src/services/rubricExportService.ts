/**
 * rubricExportService.ts — Rubric Intelligence Engine (RC2 Phase 1),
 * Phase 8: Intelligence Layer service.
 *
 * The actual CSV logic lives in csvExportService.ts (exportRubricsCsv),
 * matching every other export function's exact shape in that one file
 * (headers/row-mapping/downloadCsv/stamp) rather than duplicating that
 * logic in a second module. This file exists so the rubric domain has
 * its own named service to import from, per the Intelligence Layer's
 * service list -- a thin re-export, not a parallel implementation.
 */
export { exportRubricsCsv } from "./csvExportService";
