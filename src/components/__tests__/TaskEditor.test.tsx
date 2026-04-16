import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TaskEditor from '../TaskEditor';

// Mock react-quill since it doesn't work well in JSDOM out of the box
vi.mock('react-quill', () => {
  return {
    default: ({ value, onChange }: any) => (
      <textarea 
        data-testid="quill-mock" 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
});

describe('TaskEditor Component', () => {
  it('renders correctly', () => {
    render(<TaskEditor onSave={vi.fn()} isAdmin={false} />);
    expect(screen.getByPlaceholderText(/Task Title/i)).toBeInTheDocument();
  });

  it('toggles poll options when "Create Poll" is checked', () => {
    render(<TaskEditor onSave={vi.fn()} isAdmin={true} />);
    
    // initially no poll options
    expect(screen.queryByPlaceholderText(/Option 1/i)).not.toBeInTheDocument();
    
    // click create poll
    const pollCheckbox = screen.getByLabelText(/Make this a Poll/i);
    fireEvent.click(pollCheckbox);
    
    // poll options should appear
    expect(screen.getByPlaceholderText(/Option 1/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Option 2/i)).toBeInTheDocument();
  });

  it('allows adding a custom group name', () => {
    render(<TaskEditor onSave={vi.fn()} isAdmin={false} />);
    const groupInput = screen.getByPlaceholderText(/e\.g\. Announcements/i);
    fireEvent.change(groupInput, { target: { value: 'Development' } });
    expect(groupInput).toHaveValue('Development');
  });

  it('calls onSave with correct payload when submitting a standard task', () => {
    const mockOnSave = vi.fn();
    render(<TaskEditor onSave={mockOnSave} isAdmin={false} />);
    
    const titleInput = screen.getByPlaceholderText(/Task Title/i);
    fireEvent.change(titleInput, { target: { value: 'New Test Task' } });
    
    // Submit
    const submitBtn = screen.getByText(/Save Task/i);
    fireEvent.click(submitBtn);

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New Test Task',
      type: 'standard'
    }));
  });
});
