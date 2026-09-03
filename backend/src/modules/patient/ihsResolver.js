const NIK_SYSTEM = 'https://fhir.kemkes.go.id/id/nik';

function normalizeIdentifier(identifier) {
  return {
    system: identifier?.system || null,
    value: identifier?.value || null,
    use: identifier?.use || null,
    type: identifier?.type?.text || identifier?.type?.coding?.[0]?.display || null
  };
}

export function resolvePatientIhs(bundle, nik) {
  const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
  const candidates = entries
    .map(entry => entry?.resource)
    .filter(resource => resource?.resourceType === 'Patient' && resource?.id)
    .map(resource => ({
      patientId: resource.id,
      active: resource.active ?? null,
      name: resource.name?.[0]?.text || null,
      birthDate: resource.birthDate || null,
      gender: resource.gender || null,
      identifiers: Array.isArray(resource.identifier)
        ? resource.identifier.map(normalizeIdentifier)
        : []
    }));

  if (candidates.length === 0) {
    return {
      outcome: 'NOT_FOUND',
      patientId: null,
      candidates: []
    };
  }

  // The search is already constrained by the NIK identifier. Never pick the
  // first result when SATUSEHAT returns multiple Patient resources.
  if (candidates.length > 1) {
    return {
      outcome: 'AMBIGUOUS',
      patientId: null,
      candidates
    };
  }

  const candidate = candidates[0];
  const exactNik = candidate.identifiers.some(
    identifier => identifier.system === NIK_SYSTEM && identifier.value === String(nik)
  );

  if (!exactNik) {
    return {
      outcome: 'REVIEW',
      patientId: null,
      candidates
    };
  }

  return {
    outcome: 'MATCHED',
    patientId: candidate.patientId,
    candidates
  };
}
