import bcrypt from 'bcrypt';
import { FrequencyCode, PlantStatus, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const ORGANIZATION = {
  name: 'ESSC Sur',
  slug: 'essc-sur',
};

const FREQUENCIES = [
  { code: FrequencyCode.ONE_MONTH, label: 'Mensual', monthsInterval: 1 },
  { code: FrequencyCode.SIX_MONTHS, label: 'Semestral', monthsInterval: 6 },
  { code: FrequencyCode.ONE_YEAR, label: 'Anual', monthsInterval: 12 },
  { code: FrequencyCode.FIVE_YEARS, label: 'Quinquenal', monthsInterval: 60 },
] as const;

const MILESTONES = [
  { order: 1, code: 'CREATED', label: 'Programación creada', weight: 5 },
  { order: 2, code: 'ASSIGNED', label: 'Responsable asignado', weight: 15 },
  { order: 3, code: 'CLIENT_NOTIFIED', label: 'Cliente informado', weight: 5 },
  { order: 4, code: 'CLIENT_APPROVED', label: 'Cliente aprobado', weight: 5 },
  { order: 5, code: 'STARTED', label: 'Ejecución iniciada', weight: 20 },
  { order: 6, code: 'EVIDENCE_UPLOADED', label: 'Evidencia cargada', weight: 20 },
  { order: 7, code: 'HH_REGISTERED', label: 'HH registradas', weight: 10 },
  { order: 8, code: 'SUPERVISOR_APPROVED', label: 'Aprobación supervisora', weight: 15 },
  { order: 9, code: 'SIGNED', label: 'Cierre firmado', weight: 5 },
] as const;

const CLIENTS = [
  'Golden Clean',
  'Alifrut',
  'Eden S.A.',
  'CCU',
  'Camilo Ferrón',
  'Mylpan',
  'Goodyear',
  'Sika',
  'CEMIN',
] as const;

const PLANTS = [
  {
    code: 'ESZS-10',
    name: 'Golden Clean',
    client: 'Golden Clean',
    commissionedAt: '2014-05-30',
    latitude: null,
    longitude: null,
  },
  {
    code: 'ESZS-50',
    name: 'CCU',
    client: 'CCU',
    commissionedAt: '2015-07-31',
    latitude: -34.2598864,
    longitude: -70.9292555,
  },
  {
    code: 'ESZS-60',
    name: 'Alifrut',
    client: 'Alifrut',
    commissionedAt: '2015-09-11',
    latitude: null,
    longitude: null,
  },
  {
    code: 'ESZS-70',
    name: 'Camilo Ferrón',
    client: 'Camilo Ferrón',
    commissionedAt: '2015-12-30',
    latitude: -33.3707777,
    longitude: -70.6968341,
  },
  {
    code: 'ESZS-80',
    name: 'Mylpan',
    client: 'Mylpan',
    commissionedAt: '2022-01-17',
    latitude: -33.5958918,
    longitude: -70.6590305,
  },
  {
    code: 'ESZS-90',
    name: 'Goodyear',
    client: 'Goodyear',
    commissionedAt: '2016-11-01',
    latitude: -33.5316408,
    longitude: -70.7578644,
  },
  {
    code: 'ESZS-A0',
    name: 'Eden S.A.',
    client: 'Eden S.A.',
    commissionedAt: '2017-12-11',
    latitude: null,
    longitude: null,
  },
  {
    code: 'ESZS-A3',
    name: 'Sika',
    client: 'Sika',
    commissionedAt: '2018-08-13',
    latitude: -33.3570573,
    longitude: -70.8282357,
  },
  {
    code: 'ESZS-B2',
    name: 'CEMIN',
    client: 'CEMIN',
    commissionedAt: '2019-04-08',
    latitude: -32.7194625,
    longitude: -70.968922,
  },
] as const;

const RECERTIFICATIONS = [
  { plantCode: 'ESZS-10', code: 'CERT_5Y', dueAt: '2019-05-30', isIrregular: false, status: 'HISTORICAL' },
  { plantCode: 'ESZS-10', code: 'CERT_10Y', dueAt: '2024-05-30', isIrregular: false, status: 'HISTORICAL' },
  { plantCode: 'ESZS-10', code: 'CERT_15Y', dueAt: '2029-05-30', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-50', code: 'CERT_5Y', dueAt: '2020-07-31', isIrregular: false, status: 'HISTORICAL' },
  { plantCode: 'ESZS-50', code: 'CERT_10Y', dueAt: '2025-07-31', isIrregular: false, status: 'HISTORICAL' },
  { plantCode: 'ESZS-50', code: 'CERT_15Y', dueAt: '2030-07-31', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-60', code: 'CERT_5Y', dueAt: '2020-09-11', isIrregular: false, status: 'HISTORICAL' },
  { plantCode: 'ESZS-60', code: 'CERT_10Y', dueAt: '2025-09-11', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-60', code: 'CERT_15Y', dueAt: '2030-09-11', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-70', code: 'CERT_5Y', dueAt: '2020-12-30', isIrregular: false, status: 'HISTORICAL' },
  { plantCode: 'ESZS-70', code: 'CERT_10Y', dueAt: '2025-12-30', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-70', code: 'CERT_15Y', dueAt: '2030-12-30', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-80', code: 'CERT_5Y', dueAt: '2027-01-17', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-80', code: 'CERT_10Y', dueAt: '2032-01-17', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-80', code: 'CERT_15Y', dueAt: '2037-01-17', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-90', code: 'CERT_5Y', dueAt: '2024-12-01', isIrregular: true, status: 'HISTORICAL' },
  { plantCode: 'ESZS-90', code: 'CERT_10Y', dueAt: '2026-11-01', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-90', code: 'CERT_15Y', dueAt: '2031-11-01', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-A0', code: 'CERT_5Y', dueAt: '2025-06-11', isIrregular: true, status: 'HISTORICAL' },
  { plantCode: 'ESZS-A0', code: 'CERT_10Y', dueAt: '2027-12-11', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-A0', code: 'CERT_15Y', dueAt: '2032-12-11', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-A3', code: 'CERT_5Y', dueAt: '2025-06-13', isIrregular: true, status: 'PENDING' },
  { plantCode: 'ESZS-A3', code: 'CERT_10Y', dueAt: '2028-08-13', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-A3', code: 'CERT_15Y', dueAt: '2033-08-13', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-B2', code: 'CERT_5Y', dueAt: '2024-04-08', isIrregular: false, status: 'HISTORICAL' },
  { plantCode: 'ESZS-B2', code: 'CERT_10Y', dueAt: '2029-04-08', isIrregular: false, status: 'PENDING' },
  { plantCode: 'ESZS-B2', code: 'CERT_15Y', dueAt: '2034-04-08', isIrregular: false, status: 'PENDING' },
] as const;

const CYCLE_LABELS = {
  CERT_5Y: { label: 'Certificación 5 años', cycleYears: 5 },
  CERT_10Y: { label: 'Certificación 10 años', cycleYears: 10 },
  CERT_15Y: { label: 'Certificación 15 años', cycleYears: 15 },
} as const;

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required seed environment variable: ${name}`);
  }
  return value;
}

async function seedOrganization() {
  return prisma.organization.upsert({
    where: { slug: ORGANIZATION.slug },
    update: { name: ORGANIZATION.name },
    create: ORGANIZATION,
  });
}

async function seedFrequencies() {
  for (const frequency of FREQUENCIES) {
    await prisma.maintenanceFrequency.upsert({
      where: { code: frequency.code },
      update: {
        label: frequency.label,
        monthsInterval: frequency.monthsInterval,
      },
      create: frequency,
    });
  }
}

async function seedMilestones() {
  const totalWeight = MILESTONES.reduce((sum, milestone) => sum + milestone.weight, 0);
  if (totalWeight !== 100) {
    throw new Error(`Milestone weights must sum 100. Current sum: ${totalWeight}`);
  }

  for (const milestone of MILESTONES) {
    await prisma.milestoneConfig.upsert({
      where: { code: milestone.code },
      update: {
        label: milestone.label,
        weight: milestone.weight,
        order: milestone.order,
        active: true,
      },
      create: {
        code: milestone.code,
        label: milestone.label,
        weight: milestone.weight,
        order: milestone.order,
        active: true,
      },
    });
  }
}

async function seedClients(organizationId: string) {
  const clients = new Map<string, string>();
  for (const name of CLIENTS) {
    const client = await prisma.client.upsert({
      where: { name },
      update: { organizationId },
      create: {
        name,
        organizationId,
      },
    });
    clients.set(name, client.id);
  }
  return clients;
}

async function seedPlants(clients: Map<string, string>) {
  const plants = new Map<string, string>();

  for (const plant of PLANTS) {
    const clientId = clients.get(plant.client);
    if (!clientId) {
      throw new Error(`Missing client for plant ${plant.code}: ${plant.client}`);
    }

    const record = await prisma.plant.upsert({
      where: { code: plant.code },
      update: {
        name: plant.name,
        clientId,
        status: PlantStatus.ACTIVE,
        commissionedAt: dateOnly(plant.commissionedAt),
        latitude: plant.latitude,
        longitude: plant.longitude,
      },
      create: {
        code: plant.code,
        name: plant.name,
        clientId,
        status: PlantStatus.ACTIVE,
        commissionedAt: dateOnly(plant.commissionedAt),
        centerCode: null,
        latitude: plant.latitude,
        longitude: plant.longitude,
      },
    });
    plants.set(plant.code, record.id);
  }

  return plants;
}

async function seedRecertificationCycles(plants: Map<string, string>) {
  for (const cycle of RECERTIFICATIONS) {
    const plantId = plants.get(cycle.plantCode);
    if (!plantId) {
      throw new Error(`Missing plant for recertification cycle: ${cycle.plantCode}`);
    }

    const cycleConfig = CYCLE_LABELS[cycle.code];
    const dueAt = dateOnly(cycle.dueAt);
    const completedAt = cycle.status === 'HISTORICAL' ? dueAt : null;

    await prisma.recertificationCycle.upsert({
      where: {
        plantId_code: {
          plantId,
          code: cycle.code,
        },
      },
      update: {
        label: cycleConfig.label,
        startsAt: null,
        cycleYears: cycleConfig.cycleYears,
        dueAt,
        isIrregular: cycle.isIrregular,
        completedAt,
        status: cycle.status,
      },
      create: {
        plantId,
        code: cycle.code,
        label: cycleConfig.label,
        startsAt: null,
        cycleYears: cycleConfig.cycleYears,
        dueAt,
        isIrregular: cycle.isIrregular,
        completedAt,
        status: cycle.status,
      },
    });
  }
}

async function seedPlantAlias(plants: Map<string, string>) {
  const ceminPlantId = plants.get('ESZS-B2');
  if (!ceminPlantId) {
    throw new Error('Missing canonical CEMIN plant ESZS-B2');
  }

  await prisma.plantAlias.upsert({
    where: {
      aliasCode_source: {
        aliasCode: 'ESZS-A1',
        source: 'EXCEL_POSICIONES_ESSC_SUR',
      },
    },
    update: {
      plantId: ceminPlantId,
      reason: 'CEMIN aparece como ESZS-A1 en Posiciones MP y como ESZS-B2 en árbol KKS Fiori',
    },
    create: {
      aliasCode: 'ESZS-A1',
      plantId: ceminPlantId,
      source: 'EXCEL_POSICIONES_ESSC_SUR',
      reason: 'CEMIN aparece como ESZS-A1 en Posiciones MP y como ESZS-B2 en árbol KKS Fiori',
    },
  });
}

async function seedSuperadmin(organizationId: string) {
  const email = requiredEnv('SEED_ADMIN_EMAIL').toLowerCase();
  const password = requiredEnv('SEED_ADMIN_PASSWORD');
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Superadmin ESSC Sur',
      organizationId,
      passwordHash,
      role: Role.SUPERADMIN,
    },
  });
}

async function main() {
  const organization = await seedOrganization();
  await seedFrequencies();
  await seedMilestones();
  const clients = await seedClients(organization.id);
  const plants = await seedPlants(clients);
  await seedRecertificationCycles(plants);
  await seedPlantAlias(plants);
  await seedSuperadmin(organization.id);

  console.log('[seed] ESSC Sur master data upsert completed');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
