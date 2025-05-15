document.addEventListener('DOMContentLoaded', function() {
    const taskListUL = document.getElementById('task-list');
    const newTaskTitleInput = document.getElementById('new-task-title');
    const addTaskBtn = document.getElementById('add-task-btn');

    const taskDetailContentDiv = document.getElementById('task-detail-content');
    const taskDetailFormDiv = document.getElementById('task-detail-form');
    const detailTaskIdInput = document.getElementById('detail-task-id');
    const detailTitleInput = document.getElementById('detail-title');
    const detailDueInput = document.getElementById('detail-due');
    const detailSummaryTextarea = document.getElementById('detail-summary');
    const detailUiSelect = document.getElementById('detail-ui');
    const saveTaskBtn = document.getElementById('save-task-btn');
    const completeTaskBtn = document.getElementById('complete-task-btn');

    const mslLogEntriesDiv = document.getElementById('msl-log-entries');
    const addMslEntryFormDiv = document.getElementById('add-msl-entry-form');
    const newMslTextInput = document.getElementById('new-msl-text');
    const addMslBtn = document.getElementById('add-msl-btn');

    const viewActiveTasksBtn = document.getElementById('view-active-tasks-btn');
    const viewCompletedTasksBtn = document.getElementById('view-completed-tasks-btn');
    const taskListTitle = document.getElementById('task-list-title'); // Get the title element

    let currentTaskView = 'active'; // 'active' or 'completed'
    let currentFilter = 'Filter_UI';
    let selectedTaskId = null;

    async function fetchAPI(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                // Could add CSRF token here if implemented
            }
        };
        const response = await fetch(url, { ...defaultOptions, ...options });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            console.error('API Error:', response.status, errorData);
            alert(`Error: ${errorData.error || errorData.message || 'Request failed'}`);
            throw new Error(`API request failed: ${response.status}`);
        }
        if (response.headers.get("content-type")?.includes("application/json")) {
            return response.json();
        }
        return response.text(); // Or handle other content types
    }

    async function loadTasks() {
        try {
            const tasks = await fetchAPI(`/api/tasks?filter_by=${currentFilter}`);
            taskListUL.innerHTML = ''; // Clear existing tasks
            tasks.forEach(task => {
                const li = document.createElement('li');
                li.textContent = task.Title;
                li.dataset.taskId = task.ID;
                // Display group headers (simplified)
                const groupKey = task[`${currentFilter}_Text`]; // e.g., task.Filter_UI_Text
                let groupHeader = taskListUL.querySelector(`[data-group="${groupKey}"]`);
                if (!groupHeader) {
                    const headerLi = document.createElement('li');
                    headerLi.classList.add('group-header');
                    headerLi.textContent = groupKey;
                    headerLi.dataset.group = groupKey;
                    taskListUL.appendChild(headerLi);
                }
                li.addEventListener('click', () => {
                    loadTaskDetails(task.ID);
                    // Highlight selected
                    document.querySelectorAll('#task-list li').forEach(item => item.classList.remove('selected'));
                    li.classList.add('selected');
                });
                taskListUL.appendChild(li);
            });
        } catch (error) {
            console.error('Failed to load tasks:', error);
        }
    }

    async function loadTaskDetails(taskId, taskState) { // taskState can be 0 or 1
        selectedTaskId = taskId;
        try {
            // Fetching all tasks and then finding the one is inefficient.
            // Ideally, if you have a /api/task/<task_id> GET endpoint, use that.
            // For now, we'll find it in the current view's list if possible, or re-fetch the list.
            // This part might need refinement if you have many tasks.
            let currentListEndpoint = (currentTaskView === 'active') ? '/api/tasks' : '/api/tasks/completed';
            currentListEndpoint += `?filter_by=${currentFilter}`; // keep current filter

            const task = await fetchAPI(currentListEndpoint)
                .then(tasks => tasks.find(t => t.ID === taskId));

            if (!task) {
                clearTaskDetails();
                taskDetailContentDiv.innerHTML = '<p>Task not found or no longer in this view.</p>';
                return;
            }

            taskDetailContentDiv.innerHTML = ''; 
            taskDetailFormDiv.style.display = 'block';
            // addMslEntryFormDiv.style.display = 'block'; // Keep this for both active/completed

            detailTaskIdInput.value = task.ID;
            detailTitleInput.value = task.Title || '';
            detailSummaryTextarea.value = task.Summary || '';
            detailUiSelect.value = task.UI || '0';
            if (task.Due) {
                detailDueInput.value = task.Due.startsWith('0000-00-00') || task.Due.startsWith('9999-12-31') ? '' : task.Due.substring(0, 10);
            } else {
                detailDueInput.value = '';
            }

            // Show/hide "Complete Task" button based on taskState
            if (taskState === 0) { // Completed task
                completeTaskBtn.style.display = 'none'; // Hide complete button
                addMslEntryFormDiv.style.display = 'block'; // Still allow adding MSL entries
                detailTitleInput.readOnly = true; // Optionally make fields read-only for completed
                detailDueInput.readOnly = true;
                detailSummaryTextarea.readOnly = true;
                detailUiSelect.disabled = true;
                saveTaskBtn.style.display = 'none'; // Hide save if read-only
            } else { // Active task
                completeTaskBtn.style.display = 'inline-block'; // Show complete button
                addMslEntryFormDiv.style.display = 'block';
                detailTitleInput.readOnly = false;
                detailDueInput.readOnly = false;
                detailSummaryTextarea.readOnly = false;
                detailUiSelect.disabled = false;
                saveTaskBtn.style.display = 'inline-block';
            }

            loadMslEntries(taskId);
        } catch (error) {
            console.error('Failed to load task details:', error);
            taskDetailContentDiv.innerHTML = '<p>Error loading task details.</p>';
        }
    }

    function clearTaskDetails() {
        selectedTaskId = null;
        taskDetailFormDiv.style.display = 'none';
        addMslEntryFormDiv.style.display = 'none';
        taskDetailContentDiv.innerHTML = '<p>Select a task to see details.</p>';
        mslLogEntriesDiv.innerHTML = ''; // Clear MSL log too
        // Reset form fields
        detailTitleInput.value = '';
        detailDueInput.value = '';
        detailSummaryTextarea.value = '';
        detailUiSelect.value = '0';
    }

    viewActiveTasksBtn.addEventListener('click', () => {
        currentTaskView = 'active';
        viewActiveTasksBtn.classList.add('active-view');
        viewCompletedTasksBtn.classList.remove('active-view');
        clearTaskDetails(); // Clear details when switching views
        loadTasks();
    });

    viewCompletedTasksBtn.addEventListener('click', () => {
        currentTaskView = 'completed';
        viewCompletedTasksBtn.classList.add('active-view');
        viewActiveTasksBtn.classList.remove('active-view');
        clearTaskDetails(); // Clear details when switching views
        loadTasks();
    });

    async function loadMslEntries(taskId) {
        try {
            const entries = await fetchAPI(`/api/msl_entries/${taskId}`);
            mslLogEntriesDiv.innerHTML = '';
            if (entries.length === 0) {
                mslLogEntriesDiv.innerHTML = '<p>No MSL entries yet.</p>';
                return;
            }
            entries.forEach(entry => {
                const entryDiv = document.createElement('div');
                entryDiv.classList.add('msl-entry');
                const date = new Date(entry.Date).toLocaleString();
                entryDiv.innerHTML = `
                    <div class="meta">${date} - ${entry.Submitter_FullName || entry.Submitter_Username}</div>
                    <div class="text">${entry.Text.replace(/\n/g, '<br>')}</div>
                `;
                mslLogEntriesDiv.appendChild(entryDiv);
            });
        } catch (error) {
            console.error('Failed to load MSL entries:', error);
        }
    }

    addTaskBtn.addEventListener('click', async () => {
        const title = newTaskTitleInput.value.trim();
        if (!title) {
            alert('Task title cannot be empty.');
            return;
        }
        try {
            await fetchAPI('/api/task', {
                method: 'POST',
                body: JSON.stringify({ Title: title }) // Send other defaults if needed
            });
            newTaskTitleInput.value = '';
            loadTasks(); // Refresh task list
        } catch (error) {
            console.error('Failed to add task:', error);
        }
    });
    newTaskTitleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTaskBtn.click();
        }
    });

    saveTaskBtn.addEventListener('click', async () => {
        if (!selectedTaskId) return;
        const taskData = {
            Title: detailTitleInput.value,
            Summary: detailSummaryTextarea.value,
            UI: detailUiSelect.value,
            Due: detailDueInput.value ? new Date(detailDueInput.value).toISOString() : null // Send ISO string
        };
        try {
            await fetchAPI(`/api/task/${selectedTaskId}`, {
                method: 'PUT',
                body: JSON.stringify(taskData)
            });
            alert('Task updated successfully!');
            loadTasks(); // Refresh list (title might have changed)
        } catch (error) {
            console.error('Failed to update task:', error);
        }
    });

    completeTaskBtn.addEventListener('click', async () => {
        if (!selectedTaskId) return;
        if (!confirm('Are you sure you want to complete this task?')) return;
        try {
            await fetchAPI(`/api/task/${selectedTaskId}/complete`, { method: 'POST' });
            alert('Task marked as complete!');
            clearTaskDetails(); // Clear the detail view
            loadTasks(); // Refresh task list (it will move from active to completed)
        } catch (error) {
            console.error('Failed to complete task:', error);
        }
    });

    addMslBtn.addEventListener('click', async () => {
        if (!selectedTaskId) return;
        const text = newMslTextInput.value.trim();
        if (!text) {
            alert('MSL entry text cannot be empty.');
            return;
        }
        try {
            await fetchAPI('/api/msl_entry', {
                method: 'POST',
                body: JSON.stringify({ TaskID: selectedTaskId, Text: text })
            });
            newMslTextInput.value = '';
            loadMslEntries(selectedTaskId); // Refresh MSL log
        } catch (error) {
            console.error('Failed to add MSL entry:', error);
        }
    });
    newMslTextInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { // Enter to submit, Shift+Enter for newline
            e.preventDefault();
            addMslBtn.click();
        }
    });

    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            currentFilter = e.target.dataset.filter;
            loadTasks();
        });
    });

    
    async function loadTasks() {
        try {
            let endpoint = `/api/tasks?filter_by=${currentFilter}`;
            if (currentTaskView === 'completed') {
                endpoint = `/api/tasks/completed?filter_by=${currentFilter}`;
                taskListTitle.textContent = 'Completed Tasks'; // Update title
            } else {
                taskListTitle.textContent = 'Active Tasks'; // Update title
            }

            const tasks = await fetchAPI(endpoint);
            taskListUL.innerHTML = ''; // Clear existing tasks
            if (tasks.length === 0) {
                const li = document.createElement('li');
                li.textContent = currentTaskView === 'active' ? 'No active tasks found.' : 'No completed tasks found.';
                taskListUL.appendChild(li);
            } else {
                tasks.forEach(task => {
                    const li = document.createElement('li');
                    li.textContent = task.Title;
                    if (task.State === 0) { // If task is completed
                        li.textContent += " (Completed)";
                        li.style.textDecoration = "line-through"; // Visually indicate completion
                        li.style.color = "#777";
                    }
                    li.dataset.taskId = task.ID;
                    li.dataset.taskState = task.State; // Store task state for detail view logic

                    // Grouping logic (simplified, adjust if needed based on new Filter_Date_Text for completed)
                    const groupKey = task[`${currentFilter}_Text`]; 
                    let groupHeader = taskListUL.querySelector(`[data-group="${groupKey}"]`);
                    if (!groupHeader) {
                        const headerLi = document.createElement('li');
                        headerLi.classList.add('group-header');
                        headerLi.textContent = groupKey;
                        headerLi.dataset.group = groupKey;
                        taskListUL.appendChild(headerLi);
                    }

                    li.addEventListener('click', () => {
                        loadTaskDetails(task.ID, task.State); // Pass state to details
                        document.querySelectorAll('#task-list li').forEach(item => item.classList.remove('selected'));
                        li.classList.add('selected');
                    });
                    taskListUL.appendChild(li);
                });
            }
            // After loading tasks, clear details if no task is implicitly selected
            if (!tasks.some(task => task.ID === selectedTaskId)) {
                clearTaskDetails();
            }

        } catch (error) {
            console.error('Failed to load tasks:', error);
            taskListUL.innerHTML = '<li>Error loading tasks.</li>';
        }
    }

    // Initial load
    loadTasks();
});
