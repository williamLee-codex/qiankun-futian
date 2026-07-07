import { useGame } from '../../game/GameContext';

export default function TasksPanel() {
  const { state } = useGame();
  return (
    <div className="panel-content">
      <h2 className="panel-title">📜 每日任務</h2>
      <div className="tasks-list">
        {state.tasks.map(task => (
          <div key={task.id} className={`task-row ${task.done ? 'task-row--done' : ''}`}>
            <span className="task-check">{task.done ? '✅' : '⬜'}</span>
            <span className="task-name">{task.name}</span>
            <span className="task-reward">+5 金幣</span>
          </div>
        ))}
      </div>
      <p className="panel-note">每日任務於午夜重置，完成後自動發放獎勵。</p>
    </div>
  );
}
