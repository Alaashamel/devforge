export function createTaskController(service) {
  return {
    list: async (req, res) => {
      const result = await service.listTasks({ projectId: req.params.projectId, query: req.query });
      res.json(result);
    },

    create: async (req, res) => {
      const result = await service.createTask({
        projectId: req.params.projectId,
        userId: req.auth.userId,
        input: req.body,
      });
      res.status(201).json(result);
    },

    get: async (req, res) => {
      const result = await service.getTask({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
      });
      res.json(result);
    },

    update: async (req, res) => {
      const result = await service.updateTask({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        userId: req.auth.userId,
        input: req.body,
      });
      res.json(result);
    },

    delete: async (req, res) => {
      await service.deleteTask({ projectId: req.params.projectId, taskId: req.params.taskId });
      res.status(204).end();
    },

    listComments: async (req, res) => {
      const result = await service.listComments({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
      });
      res.json(result);
    },

    createComment: async (req, res) => {
      const result = await service.createComment({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        userId: req.auth.userId,
        body: req.body.body,
      });
      res.status(201).json(result);
    },

    updateComment: async (req, res) => {
      const result = await service.updateComment({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        commentId: req.params.commentId,
        userId: req.auth.userId,
        body: req.body.body,
      });
      res.json(result);
    },

    deleteComment: async (req, res) => {
      await service.deleteComment({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        commentId: req.params.commentId,
        userId: req.auth.userId,
      });
      res.status(204).end();
    },

    setLabels: async (req, res) => {
      const result = await service.setLabels({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        userId: req.auth.userId,
        labelIds: req.body.labelIds,
      });
      res.json(result);
    },

    listActivity: async (req, res) => {
      const result = await service.listActivity({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
      });
      res.json(result);
    },

    listDependencies: async (req, res) => {
      const result = await service.listDependencies({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
      });
      res.json(result);
    },

    createDependency: async (req, res) => {
      const result = await service.createDependency({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        userId: req.auth.userId,
        dependsOnId: req.body.dependsOnId,
      });
      res.status(201).json(result);
    },

    deleteDependency: async (req, res) => {
      await service.deleteDependency({
        projectId: req.params.projectId,
        taskId: req.params.taskId,
        userId: req.auth.userId,
        dependsOnId: req.params.dependsOnId,
      });
      res.status(204).end();
    },
  };
}
