const releaseIdParameter = {
  name: 'releaseId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;

const mutationSecurity = [
  { cookieAuth: [], csrfToken: [] },
  { bearerAuth: [] },
];

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'RUET Cover Page Directory API',
    version: '1.0.0',
    description:
      'Versioned public directory releases plus protected administrator draft, validation, publish, rollback, and audit operations.',
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/health': {
      get: {
        summary: 'Process health',
        responses: { '200': { description: 'Healthy' } },
      },
    },
    '/ready': {
      get: {
        summary: 'Database and migration readiness',
        responses: {
          '200': { description: 'Ready' },
          '503': { description: 'Not ready' },
        },
      },
    },
    '/meta': {
      get: {
        summary: 'Published directory metadata and counts',
        responses: { '200': { description: 'Metadata' } },
      },
    },
    '/dataset/manifest': {
      get: {
        summary: 'Current published release manifest',
        responses: {
          '200': { description: 'Manifest' },
          '304': { description: 'Not modified' },
        },
      },
    },
    '/dataset/export': {
      get: {
        summary: 'Complete checksummed published release',
        responses: {
          '200': { description: 'Dataset export' },
          '304': { description: 'Not modified' },
        },
      },
    },
    '/departments': {
      get: {
        summary: 'List active published departments',
        responses: { '200': { description: 'Departments' } },
      },
    },
    '/departments/{slug}': {
      get: {
        summary: 'Get an active published department',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Department' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/teachers': {
      get: {
        summary: 'Search active published teachers',
        parameters: [
          'q',
          'query',
          'department',
          'designation',
          'page',
          'limit',
          'sort',
        ].map((name) => ({
          name,
          in: 'query',
          schema: {
            type: name === 'page' || name === 'limit' ? 'integer' : 'string',
          },
        })),
        responses: {
          '200': { description: 'Paginated teacher results' },
          '400': { description: 'Invalid query' },
        },
      },
    },
    '/teachers/dataset': {
      get: {
        summary: 'Download the legacy validated offline teacher dataset',
        responses: {
          '200': { description: 'Teacher dataset' },
          '304': { description: 'Not modified' },
        },
      },
    },
    '/teachers/{id}': {
      get: {
        summary: 'Get an active teacher',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Teacher' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/courses': {
      get: {
        summary: 'Search active published courses',
        parameters: ['query', 'department', 'cursor', 'limit'].map((name) => ({
          name,
          in: 'query',
          schema: { type: name === 'limit' ? 'integer' : 'string' },
        })),
        responses: { '200': { description: 'Course results' } },
      },
    },
    '/courses/{courseKey}/suggested-teachers': {
      get: {
        summary: 'List ordered teacher suggestions for a course',
        parameters: [
          {
            name: 'courseKey',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'Suggested teachers' } },
      },
    },
    '/templates': {
      get: {
        summary: 'List approved templates',
        parameters: ['department', 'coverType'].map((name) => ({
          name,
          in: 'query',
          schema: { type: 'string' },
        })),
        responses: { '200': { description: 'Templates' } },
      },
    },
    '/admin/session/login': {
      post: {
        summary: 'Create an administrator session',
        responses: {
          '200': { description: 'Signed in' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/admin/session': {
      get: {
        summary: 'Read the current administrator session',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { '200': { description: 'Session' } },
      },
    },
    '/admin/session/logout': {
      post: {
        summary: 'Revoke the current administrator session',
        security: mutationSecurity,
        responses: { '200': { description: 'Signed out' } },
      },
    },
    '/admin/releases': {
      get: {
        summary: 'List dataset releases',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { '200': { description: 'Releases' } },
      },
      post: {
        summary: 'Create or copy a draft release',
        security: mutationSecurity,
        responses: { '201': { description: 'Draft created' } },
      },
    },
    '/admin/releases/{releaseId}/data': {
      get: {
        summary: 'Read all records in a release',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [releaseIdParameter],
        responses: { '200': { description: 'Release records' } },
      },
    },
    '/admin/releases/{releaseId}/validate': {
      get: {
        summary: 'Validate references and templates in a release',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [releaseIdParameter],
        responses: { '200': { description: 'Validation result' } },
      },
    },
    '/admin/releases/{releaseId}/publish': {
      post: {
        summary: 'Transactionally publish a valid draft',
        security: mutationSecurity,
        parameters: [releaseIdParameter],
        responses: {
          '200': { description: 'Published' },
          '409': { description: 'Invalid or conflicting release' },
        },
      },
    },
    '/admin/releases/{releaseId}/rollback': {
      post: {
        summary: 'Republish a valid retired release',
        security: mutationSecurity,
        parameters: [releaseIdParameter],
        responses: {
          '200': { description: 'Restored' },
          '403': { description: 'Owner role required' },
        },
      },
    },
    ...Object.fromEntries(
      [
        ['departments', 'department'],
        ['teachers', 'teacher'],
        ['courses', 'course'],
        ['course-teachers', 'course-teacher relationship'],
        ['templates', 'cover template'],
      ].map(([route, label]) => [
        `/admin/releases/{releaseId}/${route}`,
        {
          post: {
            summary: `Create, update, or deactivate a draft ${label}`,
            security: mutationSecurity,
            parameters: [releaseIdParameter],
            responses: {
              '200': { description: 'Record saved' },
              '409': { description: 'Conflict or immutable release' },
            },
          },
        },
      ]),
    ),
    '/admin/audit': {
      get: {
        summary: 'Read recent audit history',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { '200': { description: 'Audit events' } },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'ruet_admin_session' },
      csrfToken: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
};
