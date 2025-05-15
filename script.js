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

    async function loadTaskDetails(taskId) {
        selectedTaskId = taskId;
        // In a more complex app, you might fetch the single task details again.
        // For now, we assume the full task object is available from the list load
        // or we re-fetch. Let's re-fetch for data consistency.
        try {
            const task = await fetchAPI(`/api/tasks`) // Fetch all again, then find
                .then(tasks => tasks.find(t => t.ID === taskId));

            if (!task) {
                taskDetailContentDiv.innerHTML = '<p>Task not found.</p>';
                taskDetailFormDiv.style.display = 'none';
                addMslEntryFormDiv.style.display = 'none';
                return;
            }

            taskDetailContentDiv.innerHTML = ''; // Clear "select task" message
            taskDetailFormDiv.style.display = 'block';
            addMslEntryFormDiv.style.display = 'block';

            detailTaskIdInput.value = task.ID;
            detailTitleInput.value = task.Title || '';
            detailSummaryTextarea.value = task.Summary || '';
            detailUiSelect.value = task.UI || '0';
            if (task.Due) {
                 // HTML date input expects YYYY-MM-DD
                detailDueInput.value = task.Due.startsWith('0000-00-00') || task.Due.startsWith('9999-12-31') ? '' : task.Due.substring(0, 10);
            } else {
                detailDueInput.value = '';
            }
            loadMslEntries(taskId);
        } catch (error) {
            console.error('Failed to load task details:', error);
            taskDetailContentDiv.innerHTML = '<p>Error loading task details.</p>';
        }
    }

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
            selectedTaskId = null;
            taskDetailFormDiv.style.display = 'none';
            addMslEntryFormDiv.style.display = 'none';
            taskDetailContentDiv.innerHTML = '<p>Select a task to see details.</p>';
            mslLogEntriesDiv.innerHTML = '';
            loadTasks(); // Refresh list
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

    // Initial load
    loadTasks();
});