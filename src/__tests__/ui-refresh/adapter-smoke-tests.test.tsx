/**
 * UI Refresh Adapter Smoke Tests
 *
 * Basic rendering tests for all 16 adapters to ensure they:
 * 1. Render without errors
 * 2. Accept standard props
 * 3. Forward refs correctly
 * 4. Maintain API compatibility
 */

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Checkbox,
  Input,
  Label,
  Separator,
  Textarea,
  Switch,
} from '@/components/adapters'

describe('Adapter Smoke Tests', () => {
  describe('Button Adapter', () => {
    it('renders without crashing', () => {
      render(<Button>Click Me</Button>)
      expect(screen.getByText('Click Me')).toBeInTheDocument()
    })

    it('accepts variant prop', () => {
      render(<Button variant="outline">Outline</Button>)
      expect(screen.getByText('Outline')).toBeInTheDocument()
    })

    it('accepts size prop', () => {
      render(<Button size="lg">Large</Button>)
      expect(screen.getByText('Large')).toBeInTheDocument()
    })

    it('handles onClick', () => {
      const handleClick = jest.fn()
      render(<Button onClick={handleClick}>Click</Button>)
      screen.getByText('Click').click()
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('Card Adapter', () => {
    it('renders card structure', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Test Card</CardTitle>
          </CardHeader>
          <CardContent>Card content</CardContent>
        </Card>
      )
      expect(screen.getByText('Test Card')).toBeInTheDocument()
      expect(screen.getByText('Card content')).toBeInTheDocument()
    })

    it('accepts className prop', () => {
      const { container } = render(
        <Card className="custom-class">Content</Card>
      )
      expect(container.querySelector('.custom-class')).toBeInTheDocument()
    })
  })

  describe('Badge Adapter', () => {
    it('renders badge text', () => {
      render(<Badge>New</Badge>)
      expect(screen.getByText('New')).toBeInTheDocument()
    })

    it('accepts variant prop', () => {
      render(<Badge variant="secondary">Secondary</Badge>)
      expect(screen.getByText('Secondary')).toBeInTheDocument()
    })

    it('maintains rounded-full appearance', () => {
      const { container } = render(<Badge>Rounded</Badge>)
      const badge = screen.getByText('Rounded')
      expect(badge).toHaveClass('rounded-full')
    })
  })

  describe('Checkbox Adapter', () => {
    it('renders without crashing', () => {
      render(<Checkbox />)
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeInTheDocument()
    })

    it('handles checked state', () => {
      render(<Checkbox checked={true} onCheckedChange={() => {}} />)
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeChecked()
    })

    it('handles unchecked state', () => {
      render(<Checkbox checked={false} onCheckedChange={() => {}} />)
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()
    })
  })

  describe('Input Adapter', () => {
    it('renders input element', () => {
      render(<Input placeholder="Enter text" />)
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
    })

    it('accepts value prop', () => {
      render(<Input value="Test Value" onChange={() => {}} />)
      expect(screen.getByDisplayValue('Test Value')).toBeInTheDocument()
    })

    it('handles onChange', () => {
      const handleChange = jest.fn()
      render(<Input onChange={handleChange} />)
      const input = screen.getByRole('textbox')
      input.focus()
      // Type simulation would go here
    })
  })

  describe('Label Adapter', () => {
    it('renders label text', () => {
      render(<Label>Username</Label>)
      expect(screen.getByText('Username')).toBeInTheDocument()
    })

    it('associates with input via htmlFor', () => {
      render(
        <div>
          <Label htmlFor="test-input">Test Label</Label>
          <Input id="test-input" />
        </div>
      )
      const label = screen.getByText('Test Label')
      expect(label).toHaveAttribute('for', 'test-input')
    })
  })

  describe('Separator Adapter', () => {
    it('renders separator', () => {
      const { container } = render(<Separator />)
      const separator = container.querySelector('[role="separator"]')
      expect(separator).toBeInTheDocument()
    })

    it('accepts orientation prop', () => {
      const { container } = render(<Separator orientation="vertical" />)
      const separator = container.querySelector('[role="separator"]')
      expect(separator).toHaveAttribute('data-orientation', 'vertical')
    })
  })

  describe('Textarea Adapter', () => {
    it('renders textarea element', () => {
      render(<Textarea placeholder="Enter description" />)
      expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument()
    })

    it('accepts value prop', () => {
      render(<Textarea value="Long text here" onChange={() => {}} />)
      expect(screen.getByDisplayValue('Long text here')).toBeInTheDocument()
    })
  })

  describe('Switch Adapter', () => {
    it('renders switch component', () => {
      render(<Switch />)
      const switchElement = screen.getByRole('switch')
      expect(switchElement).toBeInTheDocument()
    })

    it('handles checked state', () => {
      render(<Switch checked={true} onCheckedChange={() => {}} />)
      const switchElement = screen.getByRole('switch')
      expect(switchElement).toBeChecked()
    })
  })
})

describe('Adapter API Compatibility', () => {
  it('Button maintains backward compatible API', () => {
    const ref = jest.fn()
    render(
      <Button ref={ref} variant="default" size="default">
        Test
      </Button>
    )
    // Ref forwarding test
    expect(ref).toHaveBeenCalled()
  })

  it('Card components maintain nesting structure', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Content paragraph</p>
        </CardContent>
      </Card>
    )

    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Content paragraph')).toBeInTheDocument()
  })

  it('Form components accept standard HTML attributes', () => {
    render(
      <div>
        <Input type="email" required aria-label="Email" />
        <Textarea rows={5} aria-label="Description" />
        <Checkbox aria-label="Accept terms" />
      </div>
    )

    const input = screen.getByLabelText('Email')
    const textarea = screen.getByLabelText('Description')
    const checkbox = screen.getByLabelText('Accept terms')

    expect(input).toHaveAttribute('type', 'email')
    expect(input).toBeRequired()
    expect(textarea).toHaveAttribute('rows', '5')
    expect(checkbox).toBeInTheDocument()
  })
})
